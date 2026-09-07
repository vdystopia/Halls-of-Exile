import assert from "node:assert/strict";
import test from "node:test";
import { ASCENDANCIES as POE1 } from "../src/lib/leagues";
import { ASCENDANCIES as POE2, CLASSES } from "../src/lib/games/poe2/classes";

test("the class list matches the 0.5 passive tree", () => {
  assert.equal(CLASSES.length, 8);
  assert.equal(Object.values(POE2).flat().length, 23);
  assert.deepEqual(POE2.Druid, ["Oracle", "Shaman"], "Druid arrived with 0.4");
});

/**
 * Ranger and Witch exist in both games, and so do Deadeye and Pathfinder — with
 * different passives behind them. Anything keyed on a class or ascendancy name
 * alone would collide across the two.
 */
test("class and ascendancy names overlap between the games", () => {
  const shared = Object.keys(POE2).filter((name) => name in POE1);
  assert.deepEqual(shared.sort(), ["Ranger", "Witch"]);
  const poe1Ascendancies = new Set(Object.values(POE1).flat());
  const overlap = Object.values(POE2).flat().filter((name) => poe1Ascendancies.has(name));
  assert.deepEqual(overlap.sort(), ["Deadeye", "Pathfinder"]);
});
