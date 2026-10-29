import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseRemote, safeName } from "../src/cli.ts";
import { maskToken, resolveConfig } from "../src/config.ts";
import { mediaTypeFor } from "../src/mime.ts";

test("parseRemote reads https, scp and ssh remotes", () => {
  const expected = { username: "esukram", repository: "fileslop", provider: "github" };
  assert.deepEqual(parseRemote("https://github.com/esukram/fileslop.git"), expected);
  assert.deepEqual(parseRemote("git@github.com:esukram/fileslop.git"), expected);
  assert.deepEqual(parseRemote("ssh://git@github.com:22/esukram/fileslop"), expected);
  assert.deepEqual(parseRemote("https://x:secret@gitlab.com/group/sub/app.git"), {
    username: "group/sub",
    repository: "app",
    provider: "gitlab",
  });
  assert.equal(parseRemote("git.example.org:team/tool").provider, "git.example.org");
  assert.deepEqual(parseRemote("/srv/git/repo"), {});
});

test("safeName makes local names valid for the server", () => {
  assert.equal(safeName("plan.html"), "plan.html");
  assert.equal(safeName("my report (final).pdf"), "my-report-final-.pdf");
  assert.equal(safeName(".env"), "env");
  assert.equal(safeName("äöü"), "file");
});

test("mediaTypeFor maps known extensions only", () => {
  assert.equal(mediaTypeFor("a.HTML"), "text/html; charset=utf-8");
  assert.equal(mediaTypeFor("shot.png"), "image/png");
  assert.equal(mediaTypeFor("data.bin"), undefined);
  assert.equal(mediaTypeFor("Makefile"), undefined);
});

test("resolveConfig prefers environment variables over the config file", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "fileslop-")), "config.json");
  await writeFile(file, JSON.stringify({ url: "https://file.example/", token: "es.fs1.key.file" }));
  const fromFile = resolveConfig({ FILESLOP_CONFIG: file });
  assert.equal(fromFile.url.value, "https://file.example/");
  assert.match(fromFile.token.source, /config file/);

  const fromEnv = resolveConfig({ FILESLOP_CONFIG: file, FILESLOP_TOKEN: "es.fs1.key.env" });
  assert.equal(fromEnv.token.value, "es.fs1.key.env");
  assert.equal(fromEnv.url.value, "https://file.example/");

  await writeFile(file, "{broken");
  assert.match(resolveConfig({ FILESLOP_CONFIG: file }).fileError ?? "", /cannot read/);
});

test("maskToken shows only the start of a token", () => {
  assert.equal(maskToken("es.fs1.key.abcdefghijkl"), "es.fs1.key.abcd…");
  assert.match(maskToken("secret"), /invalid/);
});
