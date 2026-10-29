import assert from "node:assert/strict";
import { test } from "node:test";
import { isFileId, newFileId } from "../src/id.ts";

// Expected values from @scure/base 1.2.6: bech32m.encode("fileslop", bytes.map((b) => b & 31)),
// without the "fileslop1" prefix.
const VECTORS: [number[], string][] = [
  [Array<number>(18).fill(0), "qqqqqqqqqqqqqqqqqqr4pefh"],
  [Array<number>(18).fill(255), "llllllllllllllllllra6yvj"],
  [Array.from({ length: 18 }, (_, i) => i * 15), "q07dut6fc8k95rjpsln2tadl"],
];

test("newFileId matches an independent Bech32m implementation", () => {
  for (const [bytes, id] of VECTORS) {
    assert.equal(newFileId(Uint8Array.from(bytes)), id);
    assert.ok(isFileId(id), id);
  }
});

test("newFileId creates 24-character ids that are valid and different", () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newFileId()));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.ok(isFileId(id), id);
});

test("isFileId rejects malformed ids", () => {
  for (const bad of [
    "",
    "qqqqqqqqqqqqqqqqqqr4pefq", // Wrong checksum.
    "pqqqqqqqqqqqqqqqqqr4pefh", // Changed data character.
    "qqqqqqqqqqqqqqqqqqhedt43", // Valid Bech32m checksum, but for the human-readable part "f".
    "QQQQQQQQQQQQQQQQQQR4PEFH", // Uppercase.
    "qqqqqqqqqqqqqqqqqqr4pefhq", // Too long.
    "qqqqqqqqqqqqqqqqqr4pefh", // Too short.
    "bqqqqqqqqqqqqqqqqqr4pefh", // "b" is not in the Bech32 alphabet.
    "fileslop1qqqqqqqqqqqqqqqqqqr4pefh", // The id has no prefix.
    "550e8400-e29b-41d4-a716-446655440000",
  ]) {
    assert.equal(isFileId(bad), false, bad);
  }
});
