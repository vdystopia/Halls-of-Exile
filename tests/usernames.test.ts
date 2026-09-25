import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { RESERVED_USERNAMES, usernameProblem } from "../src/lib/usernames";

test("every page under /players/ is a reserved username", () => {
  const pages = fs
    .readdirSync(path.join(process.cwd(), "src", "app", "players"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("[") && !entry.name.startsWith("("))
    .map((entry) => entry.name.toLowerCase());
  for (const page of pages) assert.ok(RESERVED_USERNAMES.includes(page), `${page} is not reserved`);
});

test("a reserved username is refused in any case, and an ordinary one allowed", () => {
  assert.ok(usernameProblem("new"));
  assert.ok(usernameProblem("NEW"));
  assert.ok(usernameProblem("ab"));
  assert.equal(usernameProblem("dystopia"), null);
  assert.equal(usernameProblem("newton"), null);
});
