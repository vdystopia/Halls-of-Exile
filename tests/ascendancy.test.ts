import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ascendancyAvatar as ascendancyAvatarFor,
  ascendancyIcon as ascendancyIconFor,
  ascendancyPortrait as ascendancyPortraitFor,
} from "../src/lib/games/ascendancy";
import { ascendancyIcon, ascendancyPortrait } from "../src/lib/games/poe1/ascendancy";
import { ASCENDANCIES as POE2_ASCENDANCIES } from "../src/lib/games/poe2/classes";

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

/**
 * Path of Exile 2 has its own portraits, from its own wiki, and a missing one is
 * the same hole in the header — so every ascendancy in the 0.5 tree's list has
 * to resolve to a file that is on disk.
 */
test("every Path of Exile 2 ascendancy has a portrait on disk", () => {
  for (const name of Object.values(POE2_ASCENDANCIES).flat()) {
    const portrait = ascendancyPortraitFor("poe2", name);
    assert.ok(portrait, `no Path of Exile 2 portrait for ${name}`);
    assert.match(portrait.src, /^\/ascendancy\/poe2\//);
    assert.ok(portrait.width > 0 && portrait.height > 0);
    const file = path.join(process.cwd(), "public", portrait.src.replace(/^\//, ""));
    assert.ok(fs.existsSync(file), `${portrait.src} is indexed but not on disk`);
  }
});

/** Deadeye and Pathfinder are names in both games and different classes in each. */
test("a name both games use resolves to each game's own art", () => {
  for (const name of ["Deadeye", "Pathfinder"]) {
    const first = ascendancyPortraitFor("poe1", name);
    const second = ascendancyPortraitFor("poe2", name);
    assert.ok(first && second);
    assert.notEqual(first.src, second.src);
  }
  assert.equal(ascendancyPortraitFor("poe2", "Elementalist"), null, "a Path of Exile ascendancy is not a Path of Exile 2 one");
});

/** No emblem sheet exists for Path of Exile 2, so a card crops the portrait's centre square. */
test("a Path of Exile 2 icon is the centre square of its portrait", () => {
  const icon = ascendancyIconFor("poe2", "Spirit Walker");
  const portrait = ascendancyPortraitFor("poe2", "Spirit Walker");
  assert.ok(icon && portrait);
  assert.equal(icon.src, portrait.src);
  assert.equal(icon.w, icon.h);
  assert.equal(icon.w, Math.min(portrait.width, portrait.height));
  assert.ok(icon.x >= 0 && icon.x + icon.w <= icon.sheetWidth);
  assert.ok(icon.y >= 0 && icon.y + icon.h <= icon.sheetHeight);
  assert.equal(ascendancyIconFor("poe2", null), null);
});

/**
 * The avatar is the picture a Most played banner draws. Every Path of Exile 1
 * ascendancy has its own on disk; a Path of Exile 2 one is its portrait.
 */
test("every ascendancy has an avatar on disk, in both games", () => {
  const names = Object.keys(
    (JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "src/lib/games/poe1/ascendancy-icons.json"), "utf8"),
    ) as { icons: Record<string, unknown> }).icons,
  );
  for (const name of names) {
    const avatar = ascendancyAvatarFor("poe1", name);
    assert.ok(avatar, `no avatar for ${name}`);
    assert.match(avatar.src, /^\/ascendancy\/avatar\//);
    const file = path.join(process.cwd(), "public", avatar.src.replace(/^\//, ""));
    assert.ok(fs.existsSync(file), `${avatar.src} is indexed but not on disk`);
  }
  assert.deepEqual(ascendancyAvatarFor("poe1", "Raider"), ascendancyAvatarFor("poe1", "Warden"));
  for (const name of Object.values(POE2_ASCENDANCIES).flat()) {
    assert.deepEqual(ascendancyAvatarFor("poe2", name), ascendancyPortraitFor("poe2", name));
  }
});
