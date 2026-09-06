import assert from "node:assert/strict";
import test from "node:test";
import { ascendancyIcon } from "../src/lib/ascendancy";

test("an ascendancy resolves to a crop of the sheet", () => {
  const icon = ascendancyIcon("Elementalist");
  assert.ok(icon);
  assert.equal(icon.src, "/ascendancy.webp");
  assert.ok(icon.w > 0 && icon.h > 0);
  assert.ok(icon.x + icon.w <= icon.sheetWidth);
  assert.ok(icon.y + icon.h <= icon.sheetHeight);
});

/** Warden was Raider, and which name an export carries depends on its version. */
test("a renamed ascendancy resolves under either name", () => {
  const warden = ascendancyIcon("Warden");
  const raider = ascendancyIcon("Raider");
  assert.ok(warden);
  assert.ok(raider);
  assert.deepEqual(warden, raider);
});

test("every ascendancy in the game has an icon", () => {
  const all = [
    "Ascendant", "Reliquarian", "Luminary",
    "Juggernaut", "Berserker", "Chieftain",
    "Deadeye", "Pathfinder", "Warden",
    "Occultist", "Elementalist", "Necromancer",
    "Slayer", "Gladiator", "Champion",
    "Assassin", "Saboteur", "Trickster",
    "Inquisitor", "Hierophant", "Guardian",
  ];
  for (const name of all) assert.ok(ascendancyIcon(name), `no icon for ${name}`);
});

/** A character under level 68 has no ascendancy, and the card shows no emblem. */
test("no ascendancy and an unknown one both resolve to nothing", () => {
  assert.equal(ascendancyIcon(undefined), null);
  assert.equal(ascendancyIcon(null), null);
  assert.equal(ascendancyIcon(""), null);
  assert.equal(ascendancyIcon("Witch"), null, "a base class is not an ascendancy");
  assert.equal(ascendancyIcon("Bladeweaver"), null);
});
