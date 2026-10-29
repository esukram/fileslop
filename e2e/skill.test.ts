import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

test("the skill has the frontmatter that the skills CLI needs", async () => {
  const text = await readFile(join(import.meta.dirname, "../skills/fileslop/SKILL.md"), "utf8");
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
  assert.match(frontmatter, /^name: fileslop$/m);
  const description = /^description: (.+)$/m.exec(frontmatter)?.[1] ?? "";
  assert.ok(description.length > 50 && description.length <= 1024, "description length");
  assert.match(description, /pull request/);
  assert.ok(text.split("\n").length < 80, "the skill is short");
});
