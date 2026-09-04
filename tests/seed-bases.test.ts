import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { findItemArt } from "../src/lib/item-art";

/**
 * The demo archive is the fixture every screenshot and browser pass is judged
 * against, so its items have to be real. An invented base resolves to no art
 * and quietly shows a placeholder, which reads as a broken lookup rather than
 * as bad test data — that happened once with "Zealot Gauntlets".
 */
test("every base item in the demo seed is a real one", () => {
  const source = fs.readFileSync("scripts/seed-demo.ts", "utf8");
  const bases = new Set<string>();
  for (const match of source.matchAll(/Rarity: (RARE|UNIQUE|MAGIC)\n([^\n]+)\n([^\n]+)/g)) {
    bases.add((match[1] === "MAGIC" ? match[2] : match[3]).trim());
  }

  assert.ok(bases.size > 20, `only found ${bases.size} bases — has the seed format changed?`);
  const unresolved = [...bases].filter((base) => !findItemArt({ name: base, base }));
  assert.deepEqual(unresolved, [], `bases with no art: ${unresolved.join(", ")}`);
});
