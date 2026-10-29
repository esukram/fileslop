import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { createApp } from "../src/app.ts";
import { FileIndex } from "../src/file-index.ts";
import { newFileId } from "../src/id.ts";
import { issueKey, KeyStore } from "../src/keys.ts";
import { type ObjectStore, StorageError } from "../src/store.ts";

const [A, B, C] = [1, 2, 3].map((n) => newFileId(new Uint8Array(18).fill(n))) as [
  string,
  string,
  string,
];

/** Returns the given ids in sequence. */
const ids =
  (...list: string[]) =>
  (): string =>
    list.shift() ?? assert.fail("newId was called too often");

/** Store that records each PUT and returns the next result, "created" by default. */
function fakeStore(...results: ("created" | "exists")[]): ObjectStore & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    put: (key) => {
      keys.push(key);
      return Promise.resolve(results.shift() ?? "created");
    },
    get: () => Promise.resolve(null),
  };
}

async function start(t: TestContext, store: ObjectStore, newId: () => string, indexLines = "") {
  const dir = await mkdtemp(join(tmpdir(), "fileslop-"));
  const token = await issueKey(join(dir, "keys.txt"), "alice");
  await writeFile(join(dir, "index.jsonl"), indexLines);
  const index = await FileIndex.open(join(dir, "index.jsonl"));
  const server = createApp({
    publicUrl: new URL("https://files.example.org/fileslop/"),
    baseDir: "fileslop",
    maxUploadBytes: 1024,
    store,
    keys: new KeyStore(join(dir, "keys.txt")),
    index,
    newId,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/fileslop/`;
  const upload = async (filename: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "text/plain",
        "x-fs-filename": filename,
      },
      body: "x",
    });
    return { status: res.status, body: (await res.json()) as { id?: string; error?: string } };
  };
  return { index, url, upload };
}

test("an id in the index gets a new id", async (t) => {
  const store = fakeStore();
  const { upload } = await start(t, store, ids(A, A, B));
  assert.equal((await upload("a.txt")).body.id, A);
  assert.equal((await upload("b.txt")).body.id, B);
  assert.equal(store.keys.length, 2);
});

test("an id of an upload in progress gets a new id", { timeout: 5_000 }, async (t) => {
  // The first PUT waits until the second upload calls PUT: both uploads are in progress.
  const keys: string[] = [];
  let release = (): void => undefined;
  const blocked = new Promise<void>((resolve) => (release = resolve));
  t.after(release); // Without a second PUT, the first upload must not hang the test.
  const store: ObjectStore = {
    put: async (key) => {
      keys.push(key);
      if (keys.length === 1) await blocked;
      else release();
      return "created";
    },
    get: () => Promise.resolve(null),
  };
  const { upload } = await start(t, store, ids(A, A, B));
  const results = await Promise.all([upload("a.txt"), upload("b.txt")]);
  assert.deepEqual(
    results.map((r) => r.status),
    [201, 201],
  );
  assert.deepEqual(results.map((r) => r.body.id).sort(), [A, B].sort());
  assert.equal(keys.length, 2);
});

test("a key that exists in the store gets a new id", async (t) => {
  const store = fakeStore("exists");
  const { index, upload } = await start(t, store, ids(A, B));
  assert.equal((await upload("a.txt")).body.id, B);
  assert.equal(store.keys.length, 2);
  assert.equal(index.get(A), undefined);
  assert.equal(index.get(B)?.filename, "a.txt");
});

test("returns 500 after three collisions and releases the ids", async (t) => {
  const store = fakeStore("exists", "exists", "exists");
  const { index, upload } = await start(t, store, ids(A, A, A, A));
  const res = await upload("a.txt");
  assert.deepEqual([res.status, res.body.error], [500, "internal_error"]);
  assert.equal(store.keys.length, 3);
  assert.equal(index.size, 0);
  // The id is not reserved anymore.
  assert.equal((await upload("a.txt")).body.id, A);
});

test("an index failure after the PUT does not try a new id", async (t) => {
  const store = fakeStore();
  const { index, upload } = await start(t, store, ids(A, B));
  index.add = () => Promise.reject(new Error("disk full"));
  assert.equal((await upload("a.txt")).status, 500);
  assert.equal(store.keys.length, 1);
});

test("a store failure does not try a new id", async (t) => {
  for (const [error, status] of [
    [new StorageError("PUT: HTTP 500"), 502],
    [new Error("unexpected"), 500],
  ] as const) {
    let puts = 0;
    const store: ObjectStore = {
      put: () => {
        puts++;
        return Promise.reject(error);
      },
      get: () => Promise.resolve(null),
    };
    const { upload } = await start(t, store, () => A);
    assert.equal((await upload("a.txt")).status, status);
    assert.equal(puts, 1, error.message);
  }
});

test("serves files with UUIDs from v0.1.0 and with Bech32m ids", async (t) => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  const entry = (id: string) =>
    JSON.stringify({
      id,
      key: `fileslop/2026-44/${id}/plan.txt`,
      filename: "plan.txt",
      contentType: "text/plain",
      size: 4,
      uploader: "alice",
      createdAt: "2026-10-29T12:00:00.000Z",
    });
  const store: ObjectStore = {
    put: () => Promise.resolve("created"),
    get: () => Promise.resolve({ body: new Blob(["plan"]).stream(), size: 4 }),
  };
  const { url } = await start(t, store, ids(), `${entry(uuid)}\n${entry(C)}\n`);
  for (const id of [uuid, C]) {
    const res = await fetch(`${url}${id}/plan.txt`);
    assert.deepEqual([res.status, await res.text()], [200, "plan"], id);
  }
});
