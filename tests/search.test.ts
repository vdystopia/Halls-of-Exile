import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { emptyBuild } from "../src/lib/games/poe1/pob";
import { searchCharacters, uniquesInUse } from "../src/lib/search";
import type { BuildData, Character, ParsedItem } from "../src/lib/types";

function item(id: number, rarity: string, name: string): ParsedItem {
  return { id, rarity, name, base: "Base", sockets: [], influences: [], flags: [], implicits: [], explicits: [], raw: "" };
}

function character(id: number, name: string, fields: Partial<Character> = {}, data: Partial<BuildData> = {}): Character {
  return {
    id,
    userId: 1,
    leagueId: 1,
    slug: `c${id}`,
    name,
    className: "Witch",
    ascendancy: null,
    level: 90,
    mainSkill: null,
    notes: null,
    playedMinutes: null,
    isFavorite: 0,
    pobCode: null,
    pobUrl: null,
    retiredAt: null,
    createdAt: "2026-01-01 00:00:00",
    data: { ...emptyBuild(), ...data },
    ...fields,
  };
}

const archive = [
  character(1, "SpectreLord", { mainSkill: "Raise Spectre" }, {
    items: [item(10, "UNIQUE", "Mon'tregul's Grasp"), item(11, "UNIQUE", "Headhunter"), item(12, "RARE", "Doom Veil")],
    // Headhunter sits in the spares list: held once, never worn.
    slots: { Weapon: 10, Helmet: 12 },
  }),
  character(2, "Arrow Head", {}, {
    skillGroups: [
      {
        label: "",
        enabled: true,
        isMain: true,
        gems: [
          { name: "Tornado Shot", level: 20, quality: 20, enabled: true, support: false },
          { name: "Greater Multiple Projectiles Support", level: 20, quality: 0, enabled: true, support: true },
        ],
      },
    ],
    items: [item(20, "UNIQUE", "Watcher's Eye"), item(21, "RELIC", "Headhunter")],
    slots: { Belt: 21 },
    treeJewels: [20],
  }),
  character(3, "Headhunter Hopeful", { mainSkill: "Unknown" }),
];
const names = (query: string) => searchCharacters(archive, query).map((result) => result.character.name);

test("a unique counts only while equipped or socketed into the tree", () => {
  assert.deepEqual(uniquesInUse(archive[0].data), ["Mon'tregul's Grasp"]);
  assert.deepEqual(uniquesInUse(archive[1].data).sort(), ["Headhunter", "Watcher's Eye"]);
  // A rare's name is random, and is not a unique to search for.
  assert.deepEqual(names("doom veil"), []);
});

test("name, skill and unique all match, case-insensitively, with name matches first", () => {
  assert.deepEqual(names("headhunter"), ["Headhunter Hopeful", "Arrow Head"]);
  assert.deepEqual(names("SPECTRE"), ["SpectreLord"]);
  assert.deepEqual(names("multiple projectiles"), ["Arrow Head"]);
  assert.deepEqual(names("watcher"), ["Arrow Head"]);
});

test("every hit says which field matched", () => {
  const [result] = searchCharacters(archive, "spectre");
  assert.deepEqual(result.hits, [
    { field: "name", text: "SpectreLord" },
    { field: "skill", text: "Raise Spectre" },
  ]);
});

test("a query under two characters, or of only spaces, matches nothing", () => {
  assert.deepEqual(names("a"), []);
  assert.deepEqual(names("   "), []);
  // "Unknown" is a placeholder, not a skill.
  assert.deepEqual(names("unknown"), []);
});

test("the archive query hands search every character with its league", async () => {
  process.env.ARCHIVE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "halls-search-")), "archive.db");
  const { db } = await import("../src/lib/db");
  const { listArchive, listRecentCharacters } = await import("../src/lib/queries");

  const user = db.prepare(`INSERT INTO users (username, first_name) VALUES ('searcher', 'Test')`).run()
    .lastInsertRowid as number;
  const league = db.prepare(`SELECT id, game, slug FROM leagues WHERE game = 'poe1' AND slug = '3.25'`).get() as {
    id: number;
    game: string;
    slug: string;
  };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, level, main_skill) VALUES (?, ?, 'x', 'X', 'Witch', 80, 'Arc')`,
  ).run(user, league.id);

  const [found] = listArchive(user);
  assert.equal(found.name, "X");
  assert.equal(found.league.slug, league.slug);
  assert.equal(found.league.game, "poe1");
  assert.equal(searchCharacters(listArchive(user), "arc")[0].character.id, found.id);
  // The player page's recent cards link through the same league, not its patch.
  assert.equal(listRecentCharacters(user, 3)[0].league.slug, league.slug);
});
