import assert from "node:assert/strict";
import { test } from "node:test";
import { FILENAME_RE, isMediaType, isoWeek, METADATA_RE } from "../src/validate.ts";

test("isoWeek uses the ISO 8601 week-year", () => {
  assert.equal(isoWeek(new Date("2026-10-15T12:00:00Z")), "2026-42");
  assert.equal(isoWeek(new Date("2026-01-01T00:00:00Z")), "2026-01");
  assert.equal(isoWeek(new Date("2027-01-01T00:00:00Z")), "2026-53");
  assert.equal(isoWeek(new Date("2024-12-30T00:00:00Z")), "2025-01");
});

test("isMediaType accepts RFC 9110 media types only", () => {
  for (const ok of ["text/html", "image/svg+xml", "text/plain; charset=utf-8", 'a/b;x="y z"']) {
    assert.ok(isMediaType(ok), ok);
  }
  for (const bad of ["", "text", "text/", "/html", "text/html;", "text/html\r\nx: y", "a b/c"]) {
    assert.ok(!isMediaType(bad), bad);
  }
});

test("FILENAME_RE rejects path tricks and unsafe characters", () => {
  for (const ok of ["plan.html", "a", "report_2026-10.tar.gz"]) assert.ok(FILENAME_RE.test(ok), ok);
  for (const bad of ["", ".env", "..", "../x", "a/b", "a b", "ä.txt", "x".repeat(256)]) {
    assert.ok(!FILENAME_RE.test(bad), bad);
  }
});

test("METADATA_RE allows nested repository paths", () => {
  assert.ok(METADATA_RE.test("group/sub/repo"));
  assert.ok(!METADATA_RE.test("a, b"));
  assert.ok(!METADATA_RE.test("/root"));
});
