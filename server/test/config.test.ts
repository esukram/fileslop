import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, loadConfig } from "../src/config.ts";

const env = {
  FILESLOP_PUBLIC_URL: "https://files.example.org/fileslop",
  FILESLOP_BACKEND: "hetzner",
  FILESLOP_HETZNER_LOCATION: "fsn1",
  FILESLOP_S3_BUCKET: "b",
  FILESLOP_S3_ACCESS_KEY_ID: "a",
  FILESLOP_S3_SECRET_ACCESS_KEY: "s",
};

test("loadConfig applies defaults and adds the trailing slash", () => {
  const config = loadConfig(env);
  assert.equal(config.publicUrl.href, "https://files.example.org/fileslop/");
  assert.equal(config.port, 8080);
  assert.equal(config.baseDir, "fileslop");
});

test("loadConfig rejects ports outside 0-65535", () => {
  assert.throws(() => loadConfig({ ...env, FILESLOP_PORT: "65536" }), ConfigError);
  assert.equal(loadConfig({ ...env, FILESLOP_PORT: "0" }).port, 0);
});
