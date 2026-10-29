import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "../src/app.ts";
import { FileIndex } from "../src/file-index.ts";
import { issueKey, KeyStore } from "../src/keys.ts";
import type { ObjectStore } from "../src/store.ts";

test("two concurrent uploads never share an id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fileslop-"));
  const token = await issueKey(join(dir, "keys.txt"), "alice");
  const keys: string[] = [];
  const store: ObjectStore = {
    // Slow store: both requests are in progress at the same time.
    put: async (key) => {
      keys.push(key);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return "created";
    },
    get: () => Promise.resolve(null),
  };
  const server = createApp({
    publicUrl: new URL("https://files.example.org/fileslop/"),
    baseDir: "fileslop",
    maxUploadBytes: 1024,
    store,
    keys: new KeyStore(join(dir, "keys.txt")),
    index: await FileIndex.open(join(dir, "index.jsonl")),
    newId: () => "550e8400-e29b-41d4-a716-446655440000",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/fileslop/`;
  const upload = (filename: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "text/plain",
        "x-fs-filename": filename,
      },
      body: "x",
    });
  try {
    const statuses = (await Promise.all([upload("a.txt"), upload("b.txt")])).map((r) => r.status);
    assert.deepEqual(statuses.sort(), [201, 409]);
    assert.equal(keys.length, 1);
    assert.equal((await upload("c.txt")).status, 409); // The index has the id now.
  } finally {
    server.close();
  }
});
