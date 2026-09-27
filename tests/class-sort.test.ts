import assert from "node:assert/strict";
import test from "node:test";
import { CLASS_SORT_DEFAULT, sortClassRows } from "../src/lib/class-sort";

const rows = [
  { name: "Witch", playedMinutes: 6000, characters: 17, leagues: 13, averageLevel: 87.1, highestLevel: 100 },
  { name: "Marauder", playedMinutes: 2400, characters: 10, leagues: 9, averageLevel: 88.9, highestLevel: 99 },
  { name: "Ranger", playedMinutes: 3000, characters: 6, leagues: 5, averageLevel: 86.3, highestLevel: 98 },
  { name: "Scion", playedMinutes: 0, characters: 2, leagues: 2, averageLevel: null, highestLevel: null },
];
const names = (sorted: typeof rows) => sorted.map((row) => row.name);

test("the class table sorts by /played, longest first, by default, and the class column reads A to Z first", () => {
  assert.equal(CLASS_SORT_DEFAULT.played, "desc");
  assert.equal(CLASS_SORT_DEFAULT.class, "asc");
  assert.deepEqual(names(sortClassRows(rows, "played", "desc")), ["Witch", "Ranger", "Marauder", "Scion"]);
  assert.deepEqual(names(sortClassRows(rows, "class", "asc")), ["Marauder", "Ranger", "Scion", "Witch"]);
  assert.deepEqual(names(sortClassRows(rows, "class", "desc")), ["Witch", "Scion", "Ranger", "Marauder"]);
});

/**
 * The direction goes into the comparison, not over the result: a class with no
 * level recorded, or no /played at all, stays at the bottom either way round
 * rather than floating to the top on the second click.
 */
test("a row with nothing to sort by stays last whichever way the column points", () => {
  assert.equal(names(sortClassRows(rows, "played", "asc")).at(-1), "Scion");
  assert.equal(names(sortClassRows(rows, "played", "desc")).at(-1), "Scion");
  assert.deepEqual(names(sortClassRows(rows, "played", "asc")), ["Marauder", "Ranger", "Witch", "Scion"]);
  assert.equal(names(sortClassRows(rows, "highestLevel", "asc")).at(-1), "Scion");
  assert.equal(names(sortClassRows(rows, "averageLevel", "desc")).at(-1), "Scion");
  assert.deepEqual(names(sortClassRows(rows, "characters", "asc")), ["Scion", "Ranger", "Marauder", "Witch"]);
  assert.deepEqual(names(sortClassRows(rows, "leagues", "desc")), ["Witch", "Marauder", "Ranger", "Scion"]);
});

test("sorting returns a new list and leaves the given one alone", () => {
  const copy = rows.slice();
  sortClassRows(rows, "class", "asc");
  assert.deepEqual(rows, copy);
});
