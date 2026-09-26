import assert from "node:assert/strict";
import test from "node:test";
import { classFill, classRingOrder } from "../src/lib/games/class-colors";

/**
 * The pie goes round in the passive tree's order: Witch at the top, then
 * Shadow, Ranger, Duelist, Marauder, Templar clockwise, so the wheel is a rough
 * map of the tree. Scion (the tree's centre) and an unknown class come last.
 */
test("Path of Exile's classes are ordered as they sit on the tree, whatever order they arrive in", () => {
  const arrived = ["Marauder", "Unknown class", "Scion", "Witch", "Templar", "Ranger", "Duelist", "Shadow"];
  const { order, top } = classRingOrder("poe1", arrived);
  assert.deepEqual(order, ["Witch", "Shadow", "Ranger", "Duelist", "Marauder", "Templar", "Scion", "Unknown class"]);
  assert.deepEqual(top, ["Witch"], "Witch alone is centred on twelve o'clock");
});

/** Path of Exile 2's classes take the same places by their attributes, two to a pure one. */
test("Path of Exile 2's classes follow the same ring by attribute, with both intelligence classes at the top", () => {
  const { order, top } = classRingOrder("poe2", ["Warrior", "Druid", "Witch", "Mercenary", "Monk", "Ranger", "Huntress", "Sorceress"]);
  assert.deepEqual(order, ["Witch", "Sorceress", "Monk", "Ranger", "Huntress", "Mercenary", "Warrior", "Druid"]);
  assert.deepEqual(top, ["Witch", "Sorceress"]);
});

/**
 * A hybrid's slice runs from the colour of the class before it into the class
 * after, so laid side by side the slices make one continuous wheel: Witch's
 * blue flows through Shadow into Ranger's green, and so on round.
 */
test("a hybrid runs between its neighbours' colours in the ring's direction; a solid is one gem; unknown is stone", () => {
  const blue = "#5584ec";
  const green = "#55bf4c";
  const red = "#e2483c";
  assert.deepEqual(classFill("poe1", "Shadow"), { kind: "run", stops: [blue, green] });
  assert.deepEqual(classFill("poe1", "Duelist"), { kind: "run", stops: [green, red] });
  assert.deepEqual(classFill("poe1", "Templar"), { kind: "run", stops: [red, blue] });
  assert.deepEqual(classFill("poe1", "Scion"), { kind: "run", stops: [blue, green, red] });
  assert.deepEqual(classFill("poe2", "Druid"), { kind: "run", stops: [red, blue] });
  assert.equal(classFill("poe1", "Witch").kind, "solid");
  assert.deepEqual(classFill("poe1", "Unknown"), { kind: "stone" });
  assert.deepEqual(classFill("poe2", "Templar"), { kind: "stone" }, "a class from the other game is not this game's");
});
