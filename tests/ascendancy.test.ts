import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ascendancyAvatar as ascendancyAvatarFor,
  ascendancyIcon as ascendancyIconFor,
  ascendancyPortrait as ascendancyPortraitFor,
} from "../src/lib/games/ascendancy";
import { ASCENDANCIES } from "../src/lib/leagues";
import {
  ALTERNATE_ASCENDANCIES,
  ascendancyAvatar,
  ascendancyIcon,
  ascendancyPortrait,
} from "../src/lib/games/poe1/ascendancy";
import { TREE_DATA } from "../src/lib/games/poe1/tree-data";
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
  assert.equal(ascendancyAvatar("Witch"), null);
  assert.equal(ascendancyIcon("Witch"), null);
});

/**
 * The Phrecia-style events replace every ascendancy with one the game draws no
 * emblem for and the wiki holds no art for, so a Bog Shaman is shown as the
 * Witch it is. The table of which class each belongs to is the wiki's
 * (Legacy of Phrecia, "Ascendancy classes"); the alternate tree data lists the
 * same nineteen names, each in the slot of the ascendancy it replaced, and the
 * two must agree about the class.
 */
test("every event ascendancy is in the table, under the class of the ascendancy it replaced", () => {
  const replaced = TREE_DATA["3.28.alternate"].ascendancies as Record<string, string>;
  const classOf = (ascendancy: string) =>
    Object.entries(ASCENDANCIES).find(([, list]) => list.includes(ascendancy))?.[0];
  assert.equal(Object.keys(replaced).length, 19);
  assert.deepEqual(Object.keys(ALTERNATE_ASCENDANCIES).sort(), Object.keys(replaced).sort());
  for (const [name, original] of Object.entries(replaced)) {
    assert.equal(ALTERNATE_ASCENDANCIES[name], classOf(original), `${name} replaced ${original}`);
  }
});

test("an event ascendancy is drawn as its class, in every size", () => {
  for (const [name, className] of Object.entries(ALTERNATE_ASCENDANCIES)) {
    const portrait = ascendancyPortrait(name);
    const avatar = ascendancyAvatar(name);
    const icon = ascendancyIcon(name);
    assert.ok(portrait && avatar && icon, `no picture for ${name}`);
    assert.equal(portrait.src, `/ascendancy/class/${className.toLowerCase()}.webp`);
    assert.deepEqual(avatar, portrait, "the class picture is already a close crop of the face");
    const file = path.join(process.cwd(), "public", portrait.src.replace(/^\//, ""));
    assert.ok(fs.existsSync(file), `${portrait.src} is indexed but not on disk`);
    // No emblem exists, so the card crops the centre square of the same picture.
    assert.equal(icon.src, portrait.src);
    assert.equal(icon.w, icon.h);
    assert.equal(icon.w, Math.min(portrait.width, portrait.height));
    assert.ok(icon.x >= 0 && icon.x + icon.w <= icon.sheetWidth);
    assert.ok(icon.y >= 0 && icon.y + icon.h <= icon.sheetHeight);
  }
  assert.equal(ascendancyPortrait("Bog Shaman")?.src, "/ascendancy/class/witch.webp");
  // Through the per-game dispatch, and never for the other game.
  assert.equal(ascendancyPortraitFor("poe1", "Scavenger")?.src, "/ascendancy/class/scion.webp");
  assert.equal(ascendancyPortraitFor("poe2", "Scavenger"), null);
});

/**
 * A character with no ascendancy — under level 68, or a record that names
 * only the class — is drawn as its class, from the class's own picture on each
 * game's wiki. The ascendancy decides when there is one; the class is read only
 * when there is not, so a wrong class column cannot override a real ascendancy.
 */
test("a character with no ascendancy is drawn as its class, in both games", () => {
  for (const className of Object.keys(ASCENDANCIES)) {
    const portrait = ascendancyPortraitFor("poe1", null, className);
    assert.ok(portrait, `no class picture for ${className}`);
    assert.equal(portrait.src, `/ascendancy/class/${className.toLowerCase()}.webp`);
    assert.deepEqual(ascendancyAvatarFor("poe1", null, className), portrait);
    assert.equal(ascendancyIconFor("poe1", "", className)?.src, portrait.src);
    assert.ok(fs.existsSync(path.join(process.cwd(), "public", portrait.src.replace(/^\//, ""))));
  }
  for (const className of Object.keys(POE2_ASCENDANCIES)) {
    const portrait = ascendancyPortraitFor("poe2", null, className);
    assert.ok(portrait, `no Path of Exile 2 class picture for ${className}`);
    assert.equal(portrait.src, `/ascendancy/poe2/class/${className.toLowerCase()}.webp`);
    assert.ok(portrait.width > 0 && portrait.height > 0);
    assert.equal(ascendancyIconFor("poe2", undefined, className)?.src, portrait.src);
    assert.ok(fs.existsSync(path.join(process.cwd(), "public", portrait.src.replace(/^\//, ""))));
  }
  // Witch is a class in both games, and each game's own picture.
  assert.notEqual(ascendancyPortraitFor("poe1", null, "Witch")?.src, ascendancyPortraitFor("poe2", null, "Witch")?.src);
  // The record's placeholder for a missing class, and a class from the other game, draw nothing.
  assert.equal(ascendancyPortraitFor("poe1", null, "Unknown"), null);
  assert.equal(ascendancyPortraitFor("poe1", null, "Sorceress"), null);
  assert.equal(ascendancyPortraitFor("poe2", null, "Templar"), null);
  assert.equal(ascendancyIconFor("poe1", null, null), null);
});

test("the ascendancy decides the picture, and the class is read only when there is none", () => {
  // A Surfcaster filed under Ranger is drawn as the Shadow it is.
  assert.equal(ascendancyPortrait("Surfcaster", "Ranger")?.src, "/ascendancy/class/shadow.webp");
  assert.equal(ascendancyPortrait("Necromancer", "Ranger")?.src, "/ascendancy/necromancer.webp");
  // An ascendancy nobody knows is not the same as none: the class is not guessed for it.
  assert.equal(ascendancyPortrait("Bladeweaver", "Witch"), null);
  assert.equal(ascendancyPortraitFor("poe2", "Bladeweaver", "Witch"), null);
  // A class in the ascendancy slot is still not an ascendancy.
  assert.equal(ascendancyPortrait("Witch", "Witch"), null);
  // The owner's record writes "Unknown" for a value it lacks; that is no ascendancy, not a strange one.
  assert.equal(ascendancyPortraitFor("poe1", "Unknown", "Templar")?.src, "/ascendancy/class/templar.webp");
  assert.equal(ascendancyAvatarFor("poe1", "Unknown", "Templar")?.src, "/ascendancy/class/templar.webp");
  assert.equal(ascendancyIconFor("poe1", "Unknown", "Templar")?.src, "/ascendancy/class/templar.webp");
  assert.equal(ascendancyPortraitFor("poe1", "Unknown", "Unknown"), null);
});

/** A real ascendancy never falls through to a class picture. */
test("a regular ascendancy keeps its own art", () => {
  assert.equal(ascendancyPortrait("Necromancer")?.src, "/ascendancy/necromancer.webp");
  assert.equal(ascendancyAvatar("Necromancer")?.src, "/ascendancy/avatar/necromancer.webp");
  assert.equal(ascendancyIcon("Necromancer")?.src, "/ascendancy.webp");
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
