import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import {
  emptyConfig,
  issueKey,
  PUBLIC_URL,
  run,
  SERVER,
  serverEnv,
  startServer,
  tempDir,
} from "./helpers.ts";
import type { RunningServer } from "./helpers.ts";
import { type MockS3, startMockS3 } from "./mock-s3.ts";

const ID = "[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{24}";
const KEY_RE = new RegExp(`^fileslop/\\d{4}-\\d{2}/${ID}/plan\\.html$`);

describe("server", () => {
  let mock: MockS3;
  let server: RunningServer;
  let dataDir: string;
  let token: string;

  const post = (headers: Record<string, string>, body: string | Uint8Array = "<h1>plan</h1>") =>
    fetch(server.url, { method: "POST", headers, body });
  const valid = (extra: Record<string, string> = {}): Record<string, string> => ({
    authorization: `Bearer ${token}`,
    "content-type": "text/html; charset=utf-8",
    "x-fs-filename": "plan.html",
    ...extra,
  });

  // before() can stop half-way. after() closes only what before() started.
  const cleanup: (() => Promise<void>)[] = [];

  before(async () => {
    mock = await startMockS3();
    cleanup.push(() => mock.close());
    dataDir = await tempDir();
    token = await issueKey(dataDir, "alice");
    server = await startServer(
      serverEnv(mock, dataDir, { FILESLOP_MAX_UPLOAD_BYTES: "1024" }),
      dataDir,
    );
    cleanup.push(() => server.stop());
  });
  after(async () => {
    for (const close of cleanup.reverse()) await close();
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
    assert.match(String(body["id"]), new RegExp(`^${ID}$`));
    assert.equal(body["url"], `${PUBLIC_URL}${String(body["id"])}/plan.html`);
    assert.equal(res.headers.get("location"), body["url"]);
    assert.deepEqual(
      { filename: body["filename"], contentType: body["contentType"], size: body["size"] },
      { filename: "plan.html", contentType: "text/html; charset=utf-8", size: 13 },
    );

    const last = [...mock.objects].at(-1);
    assert.ok(last);
    const [key, object] = last;
    assert.match(key, KEY_RE);
    assert.equal(object.body.toString(), "<h1>plan</h1>");
    assert.equal(object.contentType, "text/html; charset=utf-8");
    assert.deepEqual(object.metadata, {
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

  test("accepts empty files", async () => {
    const res = await post(
      valid({ "x-fs-filename": "empty.txt", "content-type": "text/plain" }),
      "",
    );
    assert.equal(res.status, 201);
    const { url, size } = (await res.json()) as { url: string; size: number };
    assert.equal(size, 0);
    const file = await fetch(server.local(url));
    assert.equal(file.status, 200);
    assert.equal(await file.text(), "");
  });

  test("rejects too large bodies, with and without Content-Length", async () => {
    const big = await post(valid(), "x".repeat(2048));
    assert.equal(big.status, 413);
    assert.equal(((await big.json()) as { error: string }).error, "payload_too_large");

    const chunks = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(2048)));
        controller.close();
      },
    });
    const chunked = await fetch(server.url, {
      method: "POST",
      headers: valid(),
      body: chunks,
      duplex: "half",
    });
    assert.equal(chunked.status, 413);
  });

  test("answers HEAD requests without a body", async () => {
    const created = (await (await post(valid())).json()) as { url: string };
    const res = await fetch(server.local(created.url), { method: "HEAD" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(await res.text(), "");
  });

  test("never overwrites an existing object", async () => {
    const before = mock.objects.size;
    const requests = mock.requests.length;
    // Make every key exist in the store: each conditional write must fail.
    const realHas = mock.objects.has.bind(mock.objects);
    mock.objects.has = () => true;
    try {
      const res = await post(valid());
      assert.equal(res.status, 500);
      assert.equal(((await res.json()) as { error: string }).error, "internal_error");
    } finally {
      mock.objects.has = realHas;
    }
    assert.equal(mock.objects.size, before);
    // Three attempts, each with a new id.
    const puts = mock.requests.slice(requests).filter((r) => r.method === "PUT");
    assert.equal(puts.length, 3);
    assert.equal(new Set(puts.map((r) => r.key)).size, 3);
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

  test("returns 404 when the object is gone from the store", async () => {
    const created = (await (await post(valid())).json()) as { url: string; id: string };
    for (const key of mock.objects.keys()) if (key.includes(created.id)) mock.objects.delete(key);
    assert.equal((await fetch(server.local(created.url))).status, 404);
  });

  test("rejects a key removed from the key file while the server runs", async () => {
    const carolToken = await issueKey(dataDir, "carol");
    assert.equal((await post(valid({ authorization: `Bearer ${carolToken}` }))).status, 201);
    const file = join(dataDir, "keys.txt");
    const lines = (await readFile(file, "utf8")).split("\n");
    await writeFile(file, lines.filter((line) => !line.startsWith("carol:")).join("\n"));
    assert.equal((await post(valid({ authorization: `Bearer ${carolToken}` }))).status, 401);
    assert.equal((await post(valid())).status, 201);
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

  test("never logs tokens", async () => {
    await fetch(`${server.url}?token=${token}`, { method: "POST" });
    await fetch(`${server.url}healthz?token=${token}`);
    assert.ok(!server.logs().includes(token));
    assert.ok(!server.logs().includes("es.fs1.key."));
  });
});

describe("server lifecycle", () => {
  test("keeps the lookup table across restarts", async (t) => {
    const mock = await startMockS3();
    t.after(() => mock.close());
    const dataDir = await tempDir();
    const token = await issueKey(dataDir, "alice");
    const env = serverEnv(mock, dataDir);
    const first = await startServer(env, dataDir);
    t.after(() => first.stop());
    const res = await fetch(first.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "text/plain",
        "x-fs-filename": "notes.txt",
      },
      body: "persist me",
    });
    const { url } = (await res.json()) as { url: string };
    await first.stop();

    const second = await startServer(env, dataDir);
    t.after(() => second.stop());
    const again = await fetch(second.local(url));
    assert.equal(again.status, 200);
    assert.equal(await again.text(), "persist me");
  });

  test("starts from the default config file and keeps the data next to it", async (t) => {
    const mock = await startMockS3();
    t.after(() => mock.close());
    const xdg = await tempDir();
    const configDir = join(xdg, "fileslop");
    await mkdir(configDir);
    // Without FILESLOP_DATA_DIR, the data folder is the config folder.
    const token = await issueKey(configDir, "alice");
    const env = serverEnv(mock, configDir, {
      FILESLOP_BACKEND: "aws_s3",
      FILESLOP_S3_REGION: "eu-central-1",
    });
    delete (env as Record<string, string | undefined>)["FILESLOP_HETZNER_LOCATION"];
    delete (env as Record<string, string | undefined>)["FILESLOP_DATA_DIR"];
    const dotenv = Object.entries(env)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n");
    await writeFile(
      join(configDir, ".env"),
      `# from the config file\n${dotenv}\nFILESLOP_BASE_DIR=from-file\n`,
    );
    // Real environment variables win over the config file.
    const server = await startServer({ XDG_CONFIG_HOME: xdg, FILESLOP_BASE_DIR: "from-env" }, xdg, [
      SERVER,
      "serve",
    ]);
    t.after(() => server.stop());
    const res = await fetch(server.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "text/plain",
        "x-fs-filename": "aws.txt",
      },
      body: "aws",
    });
    assert.equal(res.status, 201);
    assert.match(mock.requests.at(-1)?.headers.authorization ?? "", /\/eu-central-1\/s3\//);
    assert.match(mock.requests.at(-1)?.key ?? "", /^from-env\//);
    const index = join(configDir, "index.jsonl");
    assert.match(await readFile(index, "utf8"), /aws\.txt/);
    assert.equal((await stat(index)).mode & 0o777, 0o600);
  });

  test("refuses to start without a config file", async () => {
    // run() sets HOME to the working directory.
    const home = await tempDir();
    const defaultFile = join(home, ".config", "fileslop", ".env");
    for (const args of [["serve"], ["issue-key", "alice"]]) {
      const result = await run([SERVER, ...args], {}, home);
      assert.equal(result.code, 2, args.join(" "));
      assert.ok(
        result.stderr.includes(`no config file ${defaultFile}\nFix: Create`),
        result.stderr,
      );
    }
    const missing = join(home, "missing.env");
    const explicit = await run([SERVER, "serve", "--config", missing], {}, home);
    assert.equal(explicit.code, 2);
    assert.ok(explicit.stderr.includes(`no config file ${missing}`), explicit.stderr);
  });

  test("exits with code 2 and lists all configuration problems", async () => {
    const dir = await tempDir();
    const result = await run(
      [SERVER, "serve", "--config", await emptyConfig(dir)],
      {
        FILESLOP_BACKEND: "azure",
        FILESLOP_PORT: "abc",
        FILESLOP_S3_ENDPOINT: "ftp://store.example/",
        FILESLOP_DATA_DIR: dir,
      },
      dir,
    );
    assert.equal(result.code, 2);
    for (const name of [
      "FILESLOP_PUBLIC_URL",
      "FILESLOP_BACKEND",
      "FILESLOP_PORT",
      "FILESLOP_S3_BUCKET",
      "FILESLOP_S3_ENDPOINT must be an http",
    ]) {
      assert.match(result.stderr, new RegExp(name));
    }
  });

  test("issue-key rejects an invalid username", async () => {
    const dir = await tempDir();
    const result = await run(
      [SERVER, "issue-key", "bad name", "--config", await emptyConfig(dir)],
      { FILESLOP_DATA_DIR: dir },
      dir,
    );
    assert.equal(result.code, 1);
    assert.match(result.stderr, /invalid username/);
  });

  test("issue-key creates the data folder for the owner only", async () => {
    const dir = await tempDir();
    const dataDir = join(dir, "new", "data");
    const result = await run(
      [SERVER, "issue-key", "alice", "--config", await emptyConfig(dir)],
      { FILESLOP_DATA_DIR: dataDir },
      dir,
    );
    assert.equal(result.code, 0, result.stderr);
    assert.equal((await stat(dataDir)).mode & 0o777, 0o700);
  });
});
