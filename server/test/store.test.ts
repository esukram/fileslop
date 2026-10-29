import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createStore, type StoreConfig } from "../src/store.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function putUrl(config: Partial<StoreConfig>): Promise<string> {
  let seen = "";
  globalThis.fetch = (input) => {
    seen = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(new Response(null, { status: 200 }));
  };
  const store = createStore({
    backend: "aws_s3",
    bucket: "my-bucket",
    region: "eu-central-1",
    endpoint: undefined,
    credentials: { accessKeyId: "a", secretAccessKey: "s" },
    ...config,
  });
  await store.put("fileslop/2026-44/id/plan.html", new Uint8Array([1]), "text/html", {});
  return seen;
}

test("createStore resolves the endpoint of each backend", async () => {
  assert.equal(
    await putUrl({}),
    "https://my-bucket.s3.eu-central-1.amazonaws.com/fileslop/2026-44/id/plan.html",
  );
  assert.equal(
    await putUrl({ backend: "hetzner", region: "fsn1" }),
    "https://my-bucket.fsn1.your-objectstorage.com/fileslop/2026-44/id/plan.html",
  );
  assert.equal(
    await putUrl({ endpoint: new URL("http://127.0.0.1:9000/prefix") }),
    "http://127.0.0.1:9000/prefix/my-bucket/fileslop/2026-44/id/plan.html",
  );
});
