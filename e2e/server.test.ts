import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { issueKey, PUBLIC_URL, run, SERVER, serverEnv, startServer, tempDir } from "./helpers.ts";
import type { RunningServer } from "./helpers.ts";
import { type MockS3, startMockS3 } from "./mock-s3.ts";

const KEY_RE = /^fileslop\/\d{4}-\d{2}\/[0-9a-f-]{36}\/plan\.html$/;

describe("server", () => {
  let mock: MockS3;
  let server: RunningServer;
  let dataDir: string;
  let token: string;

  const post = (headers: Record<string, string>, body: BodyInit | null = "<h1>plan</h1>") =>
    fetch(server.url, { method: "POST", headers, body });
  const valid = (extra: Record<string, string> = {}): Record<string, string> => ({
    authorization: `Bearer ${token}`,
    "content-type": "text/html; charset=utf-8",
    "x-fs-filename": "plan.html",
    ...extra,
  });

  before(async () => {
    mock = await startMockS3();
    dataDir = await tempDir();
    token = await issueKey(dataDir, "alice");
    server = await startServer(serverEnv(mock, dataDir, { FILESLOP_MAX_UPLOAD_BYTES: "1024" }), dataDir);
  });
  after(async () => {
    await server.stop();
    await mock.close();
  });

  test("uploads a file, stores metadata, and returns the public URL", async () => {
    const res = await post(
      valid({
        "x-fs-username": "esukram",
        "x-fs-repository": "fileslop",
        "x-fs-repository-provider": "github",
      }),
    );
    assert.equal(res.status, 201);
    const body = (await res.json()) as Record<string, unknown>;
    assert.match(String(body["id"]), /^[0-9a-f-]{36}$/);
    assert.equal(body["url"], `${PUBLIC_URL}${String(body["id"])}/plan.html`);
    assert.equal(res.headers.get("location"), body["url"]);
    assert.deepEqual(
      { filename: body["filename"], contentType: body["contentType"], size: body["size"] },
      { filename: "plan.html", contentType: "text/html; charset=utf-8", size: 13 },
    );

    const [key, object] = [...mock.objects].at(-1) ?? [];
    assert.match(key ?? "", KEY_RE);
    assert.equal(object?.body.toString(), "<h1>plan</h1>");
    assert.equal(object?.contentType, "text/html; charset=utf-8");
    assert.deepEqual(object?.metadata, {
      "fs-uploader": "alice",
      "fs-filename": "plan.html",
      "fs-username": "esukram",
      "fs-repository": "fileslop",
      "fs-repository-provider": "github",
    });
    assert.equal(mock.requests.at(-1)?.headers["if-none-match"], "*");
  });

  test("returns the file with its media type and safe headers", async () => {
    const created = (await (await post(valid())).json()) as { url: string; id: string };
    const res = await fetch(server.local(created.url));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "<h1>plan</h1>");
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("content-security-policy"), "sandbox allow-scripts");
    assert.match(res.headers.get("cache-control") ?? "", /immutable/);

    const wrongName = await fetch(server.local(created.url.replace("plan.html", "other.html")));
    assert.equal(wrongName.status, 404);
  });

  test("returns 404 for unknown files", async () => {
    const res = await fetch(`${server.url}550e8400-e29b-41d4-a716-446655440000/plan.html`);
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as { error: string }).error, "not_found");
    assert.equal((await fetch(`${server.url}nothing`)).status, 404);
  });

  test("rejects uploads without a valid token", async () => {
    const missing = await post({ "content-type": "text/plain", "x-fs-filename": "a.txt" });
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get("www-authenticate") ?? "", /^Bearer/);
    const wrong = await post(valid({ authorization: "Bearer es.fs1.key.wrong" }));
    assert.equal(wrong.status, 401);
    const noPrefix = await post(valid({ authorization: `Bearer ${token.slice(11)}` }));
    assert.equal(noPrefix.status, 401);
  });

  test("rejects uploads without a media type", async () => {
    const headers = valid();
    delete headers["content-type"];
    const res = await post(headers, new Uint8Array([1, 2, 3]));
    assert.equal(res.status, 415);
    assert.equal(((await res.json()) as { error: string }).error, "missing_content_type");
    assert.equal((await post(valid({ "content-type": "html" }))).status, 415);
  });

  test("rejects invalid headers instead of rewriting them", async () => {
    const noName = valid();
    delete noName["x-fs-filename"];
    assert.equal((await post(noName)).status, 400);
    assert.equal((await post(valid({ "x-fs-filename": "../etc/passwd" }))).status, 400);
    assert.equal((await post(valid({ "x-fs-filename": ".hidden" }))).status, 400);
    const badMeta = await post(valid({ "x-fs-repository": "repo name" }));
    assert.equal(badMeta.status, 400);
    assert.equal(((await badMeta.json()) as { error: string }).error, "invalid_header");
  });

  test("rejects empty and too large bodies", async () => {
    assert.equal((await post(valid(), "")).status, 400);
    const big = await post(valid(), "x".repeat(2048));
    assert.equal(big.status, 413);
    assert.equal(((await big.json()) as { error: string }).error, "payload_too_large");
  });

  test("never overwrites an existing object", async () => {
    const before = mock.objects.size;
    // Make every key exist in the store: the conditional write must fail.
    const realHas = mock.objects.has.bind(mock.objects);
    mock.objects.has = () => true;
    try {
      const res = await post(valid());
      assert.equal(res.status, 409);
      assert.equal(((await res.json()) as { error: string }).error, "conflict");
    } finally {
      mock.objects.has = realHas;
    }
    assert.equal(mock.objects.size, before);
  });

  test("reports object store failures as 502", async () => {
    mock.failing = true;
    try {
      const res = await post(valid());
      assert.equal(res.status, 502);
      assert.equal(((await res.json()) as { error: string }).error, "storage_error");
    } finally {
      mock.failing = false;
    }
  });

  test("accepts a key issued while the server runs", async () => {
    const bobToken = await issueKey(dataDir, "bob");
    const res = await post(valid({ authorization: `Bearer ${bobToken}` }));
    assert.equal(res.status, 201);
    assert.equal([...mock.objects.values()].at(-1)?.metadata["fs-uploader"], "bob");
  });

  test("answers health checks and rejects wrong methods", async () => {
    const health = await fetch(`${server.url}healthz`);
    assert.deepEqual(await health.json(), { status: "ok" });
    const get = await fetch(server.url);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
  });

  test("never logs tokens", () => {
    assert.ok(!server.logs().includes(token));
    assert.ok(!server.logs().includes("es.fs1.key."));
  });
});

describe("server lifecycle", () => {
  test("keeps the lookup table across restarts", async () => {
    const mock = await startMockS3();
    const dataDir = await tempDir();
    const token = await issueKey(dataDir, "alice");
    const env = serverEnv(mock, dataDir);
    let server = await startServer(env, dataDir);
    const res = await fetch(server.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "text/plain",
        "x-fs-filename": "notes.txt",
      },
      body: "persist me",
    });
    const { url } = (await res.json()) as { url: string };
    await server.stop();

    server = await startServer(env, dataDir);
    try {
      const again = await fetch(server.local(url));
      assert.equal(again.status, 200);
      assert.equal(await again.text(), "persist me");
    } finally {
      await server.stop();
      await mock.close();
    }
  });

  test("exits with code 2 and lists all configuration problems", async () => {
    const dir = await tempDir();
    const result = await run(
      [SERVER, "serve"],
      { FILESLOP_BACKEND: "azure", FILESLOP_PORT: "abc", FILESLOP_DATA_DIR: dir },
      dir,
    );
    assert.equal(result.code, 2);
    for (const name of ["FILESLOP_PUBLIC_URL", "FILESLOP_BACKEND", "FILESLOP_PORT", "FILESLOP_S3_BUCKET"]) {
      assert.match(result.stderr, new RegExp(name));
    }
  });

  test("issue-key rejects an invalid username", async () => {
    const dir = await tempDir();
    const result = await run([SERVER, "issue-key", "bad name"], { FILESLOP_DATA_DIR: dir }, dir);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /invalid username/);
  });
});
