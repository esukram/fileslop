import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import {
  CLIENT,
  issueKey,
  run,
  type RunningServer,
  serverEnv,
  startServer,
  tempDir,
} from "./helpers.ts";
import { type MockS3, startMockS3 } from "./mock-s3.ts";

describe("client cli", () => {
  let mock: MockS3;
  let server: RunningServer;
  let token: string;
  let work: string;
  let env: Record<string, string>;

  const cli = (args: string[], extraEnv: Record<string, string> = {}, cwd = work) =>
    run([CLIENT, ...args], { ...env, ...extraEnv }, cwd);

  before(async () => {
    mock = await startMockS3();
    const dataDir = await tempDir();
    token = await issueKey(dataDir, "agent");
    server = await startServer(
      serverEnv(mock, dataDir, { FILESLOP_MAX_UPLOAD_BYTES: "4096" }),
      dataDir,
    );
    work = await tempDir();
    // A git checkout with a GitHub remote, as agents use it.
    execFileSync("git", ["init", "-q", work]);
    execFileSync("git", [
      "-C",
      work,
      "remote",
      "add",
      "origin",
      "git@github.com:esukram/fileslop.git",
    ]);
    await writeFile(join(work, "plan.html"), "<h1>plan</h1>");
    await writeFile(join(work, "data.bin"), "binary");
    await writeFile(join(work, "big.txt"), "x".repeat(5000));
    await writeFile(join(work, "empty.txt"), "");
    env = { FILESLOP_URL: server.url, FILESLOP_TOKEN: token };
  });
  after(async () => {
    await server.stop();
    await mock.close();
  });

  test("uploads a file and prints the URL as JSON", async () => {
    const result = await cli(["upload", "plan.html"]);
    assert.equal(result.code, 0, result.stderr);
    const out = JSON.parse(result.stdout) as { url: string; contentType: string; filename: string };
    assert.equal(out.filename, "plan.html");
    assert.equal(out.contentType, "text/html; charset=utf-8");
    const res = await fetch(server.local(out.url));
    assert.equal(await res.text(), "<h1>plan</h1>");
    assert.deepEqual([...mock.objects.values()].at(-1)?.metadata, {
      "fs-uploader": "agent",
      "fs-filename": "plan.html",
      "fs-username": "esukram",
      "fs-repository": "fileslop",
      "fs-repository-provider": "github",
    });
  });

  test("uses flags over git metadata, and --no-git", async () => {
    const flags = await cli(["upload", "plan.html", "-n", "pr-1.html", "--repository", "other"]);
    assert.equal(flags.code, 0, flags.stderr);
    assert.equal((JSON.parse(flags.stdout) as { filename: string }).filename, "pr-1.html");
    assert.equal([...mock.objects.values()].at(-1)?.metadata["fs-repository"], "other");

    const noGit = await cli(["upload", "plan.html", "--no-git"]);
    assert.equal(noGit.code, 0, noGit.stderr);
    assert.equal([...mock.objects.values()].at(-1)?.metadata["fs-username"], undefined);
  });

  test("needs --type for unknown extensions", async () => {
    const unknown = await cli(["upload", "data.bin"]);
    assert.equal(unknown.code, 2);
    assert.match(unknown.stderr, /unknown media type[\s\S]*Fix: Pass the media type with --type/);
    const typed = await cli(["upload", "data.bin", "--type", "application/octet-stream"]);
    assert.equal(typed.code, 0, typed.stderr);
    assert.equal(
      (JSON.parse(typed.stdout) as { contentType: string }).contentType,
      "application/octet-stream",
    );
  });

  test("reports server rejections with a fix", async () => {
    const badToken = await cli(["upload", "plan.html"], { FILESLOP_TOKEN: "es.fs1.key.invalid" });
    assert.equal(badToken.code, 1);
    assert.match(badToken.stderr, /HTTP 401 unauthorized[\s\S]*Fix: Check FILESLOP_TOKEN/);

    const big = await cli(["upload", "big.txt"]);
    assert.equal(big.code, 1);
    assert.match(big.stderr, /HTTP 413[\s\S]*Fix: The file is too large/);

    const badType = await cli(["upload", "plan.html", "--type", "html"]);
    assert.equal(badType.code, 1);
    assert.match(badType.stderr, /HTTP 415[\s\S]*Fix: Pass the media type/);
  });

  test("reports configuration and usage problems with exit code 2", async () => {
    const noConfig = await run([CLIENT, "upload", "plan.html"], {}, work);
    assert.equal(noConfig.code, 2);
    assert.match(noConfig.stderr, /no server URL[\s\S]*Fix: Set FILESLOP_URL/);

    const noToken = await run([CLIENT, "upload", "plan.html"], { FILESLOP_URL: server.url }, work);
    assert.equal(noToken.code, 2);
    assert.match(noToken.stderr, /Fix: Set FILESLOP_TOKEN/);

    const wrongPrefix = await cli(["upload", "plan.html"], { FILESLOP_TOKEN: "ghp_123" });
    assert.equal(wrongPrefix.code, 2);
    assert.match(wrongPrefix.stderr, /does not start with es\.fs1\.key\./);

    assert.equal((await cli(["upload", "missing.txt"])).code, 2);
    assert.equal((await cli(["upload", "empty.txt"])).code, 2);
    assert.equal((await cli(["upload"])).code, 2);
    assert.equal((await cli(["upload", "plan.html", "--bogus"])).code, 2);
    assert.equal((await cli(["bogus"])).code, 2);
  });

  test("reports an unreachable server with exit code 1", async () => {
    const result = await cli(["upload", "plan.html"], {
      FILESLOP_URL: "http://127.0.0.1:9/fileslop/",
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /cannot reach[\s\S]*Fix: Check FILESLOP_URL/);
  });

  test("reads the config file and shows it with a masked token", async () => {
    const home = await tempDir();
    await mkdir(join(home, ".config", "fileslop"), { recursive: true });
    await writeFile(
      join(home, ".config", "fileslop", "config.json"),
      JSON.stringify({ url: server.url, token }),
    );
    const upload = await run([CLIENT, "upload", join(work, "plan.html")], { HOME: home }, home);
    assert.equal(upload.code, 0, upload.stderr);

    const config = await run([CLIENT, "config"], { HOME: home }, home);
    assert.equal(config.code, 0, config.stderr);
    assert.ok(!config.stdout.includes(token));
    const shown = JSON.parse(config.stdout) as { token: string; tokenSource: string };
    assert.equal(shown.token, `${token.slice(0, 15)}…`);
    assert.match(shown.tokenSource, /config file/);
  });

  test("prints help for humans and agents", async () => {
    const help = await cli(["--help"]);
    assert.equal(help.code, 0);
    for (const word of ["upload", "config", "FILESLOP_URL", "FILESLOP_TOKEN", "Exit codes"]) {
      assert.ok(help.stdout.includes(word), word);
    }
    const uploadHelp = await cli(["help", "upload"]);
    assert.match(uploadHelp.stdout, /--type[\s\S]*Examples/);
    assert.match((await cli(["--version"])).stdout, /^\d+\.\d+\.\d+\n$/);
  });
});
