import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { issueKey, KeyStore, parseKeys, TOKEN_PREFIX } from "../src/keys.ts";
import { sha256Hex } from "../src/sigv4.ts";

test("issueKey stores only the hash and the store accepts the token", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "fileslop-")), "data", "keys.txt");
  const keys = new KeyStore(file);
  assert.equal(await keys.authenticate(`${TOKEN_PREFIX}nothing`), undefined);

  const token = await issueKey(file, "alice");
  assert.match(token, /^es\.fs1\.key\.[A-Za-z0-9_-]{43}$/);
  const text = await readFile(file, "utf8");
  assert.equal(text, `alice:${sha256Hex(token)}\n`);
  assert.ok(!text.includes(token));

  // The running store sees the new key without a restart.
  assert.equal(await keys.authenticate(token), "alice");
  assert.equal(await keys.authenticate(token.slice(0, -1) + "x"), undefined);
  assert.equal(await keys.authenticate(token.slice(TOKEN_PREFIX.length)), undefined);
});

test("issueKey rejects invalid usernames", async () => {
  await assert.rejects(issueKey("/nonexistent/keys.txt", "a:b"), /invalid username/);
});

test("parseKeys skips comments and reports bad lines", () => {
  const warnings: string[] = [];
  const hash = "a".repeat(64);
  const keys = parseKeys(`# comment\n\nbob:${hash}\nbroken\nx:short\n`, (m) => warnings.push(m));
  assert.deepEqual([...keys], [[hash, "bob"]]);
  assert.equal(warnings.length, 2);
});
