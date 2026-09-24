import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ascendancyIcon, ascendancyPortrait } from "../src/lib/games/poe1/ascendancy";

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

/**
 * The portrait is the picture the character page draws, and a missing one
 * leaves a hole in the first thing on the page — so unlike item art, every
 * ascendancy has to have one and the files are committed rather than fetched.
 */
test("every ascendancy has a class portrait on disk", () => {
  const names = Object.keys(
    (JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "src/lib/games/poe1/ascendancy-icons.json"), "utf8"),
    ) as { icons: Record<string, unknown> }).icons,
  );
  for (const name of names) {
    const portrait = ascendancyPortrait(name);
    assert.ok(portrait, `no portrait for ${name}`);
    const file = path.join(process.cwd(), "public", portrait.src.replace(/^\//, ""));
    assert.ok(fs.existsSync(file), `${portrait.src} is indexed but not on disk`);
  }
});

test("a renamed ascendancy shares one portrait file", () => {
  assert.deepEqual(ascendancyPortrait("Raider"), ascendancyPortrait("Warden"));
});

test("no ascendancy and an unknown one both resolve to no portrait", () => {
  assert.equal(ascendancyPortrait(undefined), null);
  assert.equal(ascendancyPortrait(null), null);
  assert.equal(ascendancyPortrait(""), null);
  assert.equal(ascendancyPortrait("Witch"), null, "a base class is not an ascendancy");
});
