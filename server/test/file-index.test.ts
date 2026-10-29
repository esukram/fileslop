import assert from "node:assert/strict";
import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FileIndex, type IndexEntry } from "../src/file-index.ts";

const entry = (id: string): IndexEntry => ({
  id,
  key: `fileslop/2026-44/${id}/a.txt`,
  filename: "a.txt",
  contentType: "text/plain",
  size: 1,
  uploader: "alice",
  createdAt: "2026-10-29T00:00:00.000Z",
});

test("FileIndex persists entries and survives a partial last line", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "fileslop-")), "index.jsonl");
  const first = await FileIndex.open(file);
  await first.add(entry("one"));
  await appendFile(file, '{"id":"bro'); // Simulates a crash during a write.

  const second = await FileIndex.open(file);
  assert.deepEqual(second.get("one"), entry("one"));
  await second.add(entry("two"));

  const third = await FileIndex.open(file);
  assert.equal(third.size, 2);
  assert.equal(third.get("two")?.key, entry("two").key);
});
