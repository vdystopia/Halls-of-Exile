import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

/**
 * The site was renamed to Halls of Exile to match the repository. The rename
 * left a stale "decide the name" item on the roadmap and an old `cd` line in the
 * README, so the old name is checked for across every tracked text file.
 */
test("nothing tracked still carries the old site name", () => {
  const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => /\.(md|ts|tsx|mjs|json|yml|ps1|sh|cmd)$|^Dockerfile$/.test(file))
    .filter((file) => file !== "tests/naming.test.ts" && fs.existsSync(file));
  const stale = files.filter((file) => /Halls[ -]of[ -]the[ -]Champions/i.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(stale, []);
});
