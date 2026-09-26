import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * Path of Exile 2's account export, read off pathofexile2.com. Two real
 * characters from the first export (2026-09-25) and one entry whose gear failed
 * to download, which is how a flaky session shows up in the file.
 */
const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "poe2-export.json");

process.env.ARCHIVE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "halls-poe2-")), "archive.db");

async function read() {
  const { readAccountExport } = await import("../src/lib/games/exports");
  return readAccountExport(fs.readFileSync(FIXTURE, "utf8"));
}

async function build(name: string) {
  const { buildFromExport } = await import("../src/lib/games/exports");
  const exported = await read();
  const character = exported.characters.find((entry) => entry.name === name);
  assert.ok(character, `${name} is in the fixture`);
  return { character, build: buildFromExport(character, exported), exported };
}

test("the file says which game it is from, and a character without gear is named, not imported", async () => {
  const exported = await read();
  assert.equal(exported.game, "poe2");
  assert.equal(exported.realm, "poe2");
  assert.equal(exported.account, "zxBlasphemy#5164");
  assert.deepEqual(
    exported.characters.map((character) => character.name),
    ["vSXVXRv", "PsevdoCrvb"],
  );
  assert.deepEqual(exported.skippedCharacters, ["LostInTransit"]);
});

/** The endpoints give an ascendancy id, and its number is not the list order. */
test("an ascendancy id becomes the class and ascendancy the site shows", async () => {
  const { classFromId } = await import("../src/lib/games/poe2/classes");
  assert.deepEqual(classFromId("Monk3"), { className: "Monk", ascendancy: "Acolyte of Chayula" });
  assert.deepEqual(classFromId("Huntress2"), { className: "Huntress", ascendancy: "Spirit Walker" });
  assert.deepEqual(classFromId("Witch3b"), { className: "Witch", ascendancy: "Abyssal Lich" });
  assert.deepEqual(classFromId("Sorceress"), { className: "Sorceress", ascendancy: null });
  assert.deepEqual(classFromId("Ranger2"), { className: "Ranger", ascendancy: null });
  const { character } = await build("PsevdoCrvb");
  assert.equal(character.baseClass, "Warrior");
  assert.equal(character.ascendancy, "Smith of Kitava");
});

/**
 * Only a character still in a running league has an origin that is a fact.
 * Everything in Standard is graded from its last login, and never offered as a
 * default: the last login dates the last visit, not the league it was made in.
 */
test("the origin league is certain only for a character still in it", async () => {
  const { inferOrigin } = await import("../src/lib/games/poe2/site-export");
  const now = Date.parse("2026-09-25T00:00:00Z");
  assert.deepEqual(inferOrigin("SSF Runes of Aldur", null, now), { slug: "0.5", confidence: "certain" });
  assert.deepEqual(inferOrigin("Forbidden Rites", null, now), { slug: "0.5.5", confidence: "certain" });
  assert.deepEqual(inferOrigin("HC SSF Runes of Aldur", null, now), { slug: "0.5", confidence: "certain" });
  // 2026-03-01 is inside 0.4 only, which has ended.
  assert.deepEqual(inferOrigin("Standard", Date.parse("2026-03-01T00:00:00Z") / 1000, now), {
    slug: "0.4",
    confidence: "likely",
  });
  // Inside 0.5, which is still running: a Standard character cannot have come from it.
  assert.deepEqual(inferOrigin("Solo Self-Found", Date.parse("2026-07-01T00:00:00Z") / 1000, now), {
    slug: null,
    confidence: "none",
  });
  const { character } = await build("vSXVXRv");
  assert.equal(character.originPatch, "0.5");
  assert.equal(character.originConfidence, "certain");
});

test("flasks, charms and the second weapon set land in their own slots", async () => {
  const { build: vsx } = await build("vSXVXRv");
  for (const slot of ["Flask 1", "Flask 2", "Charm 1", "Charm 2", "Charm 3", "Weapon 1 Swap"]) {
    assert.ok(vsx.slots[slot], `${slot} is filled`);
  }
  const charm = vsx.items.find((item) => item.slot === "Charm 1");
  assert.match(charm?.base ?? "", /Charm$/);
  const flask = vsx.items.find((item) => item.slot === "Flask 1");
  assert.match(flask?.base ?? "", /Flask$/);
  const { build: psevdo } = await build("PsevdoCrvb");
  assert.ok(psevdo.slots["Weapon 1 Swap"] && psevdo.slots["Weapon 2 Swap"]);
});

test("mods read as the player reads them: no markup, flags kept as tags", async () => {
  const { build: psevdo } = await build("PsevdoCrvb");
  const lines = psevdo.items.flatMap((item) => [...item.implicits, ...item.explicits]);
  assert.ok(lines.length > 50);
  assert.equal(lines.filter((line) => /\[|\]/.test(line)).length, 0, "no [Tag|Display] markup survives");

  const maul = psevdo.items.find((item) => item.name === "Cataclysm Batter");
  assert.ok(maul);
  assert.ok(maul.implicits.includes("36% increased Physical Damage  ·  enchant, rune"));
  assert.ok(maul.explicits.includes("Adds 28 to 46 Physical Damage"));
  assert.equal(maul.quality, 20);
  assert.deepEqual(maul.requires, [
    { text: "Level 67", modified: false },
    { text: "134 Str", modified: false },
  ]);
  assert.deepEqual(maul.properties?.find((p) => p.name === "Rune Sockets"), {
    name: "Rune Sockets",
    value: "Greater Iron Rune, Greater Iron Rune",
  });
  assert.match(maul.iconUrl ?? "", /^https:\/\/web\.poecdn\.com\//);

  const amulet = psevdo.items.find((item) => item.slot === "Amulet");
  assert.ok(amulet?.explicits.some((line) => line.endsWith("  ·  fractured")));
  // A soul core is named in the socket it fills.
  const shield = psevdo.items.find((item) => item.slot === "Weapon 2 Swap");
  assert.match(shield?.properties?.find((p) => p.name === "Rune Sockets")?.value ?? "", /Soul Core of Jiquani/);
  assert.equal(shield?.block, 41);
});

test("a property's values are written into its text where the game templates them", async () => {
  const { build: psevdo } = await build("PsevdoCrvb");
  const flask = psevdo.items.find((item) => item.slot === "Flask 1");
  assert.ok(flask?.properties?.some((p) => /^Recovers \d+ Life over \d+ Seconds$/.test(p.name)));
  assert.equal(
    psevdo.items.flatMap((item) => item.properties ?? []).filter((p) => /\{\d\}/.test(p.name)).length,
    0,
  );
});

test("a skill an item grants is a group, with the supports linked to it", async () => {
  const { build: vsx } = await build("vSXVXRv");
  const descent = vsx.skillGroups.find((group) => group.gems[0]?.name === "Righteous Descent");
  assert.ok(descent);
  assert.deepEqual(
    descent.gems.map((gem) => [gem.name, gem.support]),
    [
      ["Righteous Descent", false],
      ["Rapid Attacks III", true],
      ["Knockback", true],
      ["Maim", true],
      ["Blind II", true],
    ],
  );
  assert.equal(descent.gems[0].level, 19);
  // What the site cannot give is absent, not faked.
  assert.deepEqual(vsx.trees, []);
  assert.deepEqual(vsx.stats, {});
  assert.equal(vsx.source, "poe2-site");
});

/**
 * Path of Exile 2 reuses Path of Exile 1's base names — Ruby Ring, Leather Belt
 * — with different pictures and numbers, so its gear must never be drawn or
 * derived from Path of Exile 1's catalogue.
 */
test("Path of Exile 2 gear never borrows Path of Exile 1's art or arithmetic", async () => {
  const { gearFor } = await import("../src/lib/games/gear");
  const { build: psevdo } = await build("PsevdoCrvb");
  const ring = psevdo.items.find((item) => item.base === "Ruby Ring");
  assert.ok(ring, "the fixture has a Ruby Ring, a base both games have");
  const poe2Art = gearFor("poe2").art(ring);
  const poe1Art = gearFor("poe1").art(ring);
  assert.match(poe2Art?.src ?? "", /^\/items\/poe2\//, "drawn from Path of Exile 2's own index");
  assert.ok(poe1Art, "Path of Exile 1 has a Ruby Ring too");
  assert.notEqual(poe2Art?.src, poe1Art.src);
  const sections = gearFor("poe2").tooltip(ring);
  assert.ok(!sections.some((section) => section.lines.some((line) => /Block/i.test(line.text))));
  assert.deepEqual(gearFor("poe2").doll.length, gearFor("poe1").doll.length);
  assert.deepEqual([...gearFor("poe2").flaskSlots], ["Flask 1", "Flask 2", "Charm 1", "Charm 2", "Charm 3"]);
});

test("a stored payload rebuilds the same build", async () => {
  const { rebuildFromStored, storedPayloadFor } = await import("../src/lib/games/exports");
  const { character, build: first, exported } = await build("PsevdoCrvb");
  const stored = JSON.parse(JSON.stringify(storedPayloadFor(character, exported)));
  assert.equal(stored.game, "poe2");
  assert.deepEqual(rebuildFromStored(stored), first);
});

/**
 * Names are unique per realm, not across games. A Path of Exile 2 export fills
 * the Path of Exile 2 character and never touches a Path of Exile 1 one that
 * shares its name.
 */
test("an import only ever matches characters in its own game", async () => {
  const { applyImport, planFor } = await import("../src/lib/import");
  const { db } = await import("../src/lib/db");
  const userId = db
    .prepare(`INSERT INTO users (username, first_name) VALUES ('poe2-tester', 'Test')`)
    .run().lastInsertRowid as number;
  const poe1 = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' AND slug = '3.25'`).get() as { id: number };
  const poe2 = db.prepare(`SELECT id FROM leagues WHERE game = 'poe2' AND slug = '0.2'`).get() as { id: number };
  const insert = db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version)
     VALUES (?, ?, 'psevdocrvb', 'PsevdoCrvb', ?, '{"source":"manual","items":[]}', 0)`,
  );
  insert.run(userId, poe1.id, "Duelist");
  insert.run(userId, poe2.id, "Warrior");

  const exported = await read();
  const plan = planFor(userId, exported, "00000000-0000-0000-0000-000000000000");
  assert.equal(plan.game, "poe2");
  const row = plan.rows.find((entry) => entry.name === "PsevdoCrvb");
  assert.equal(row?.action, "update", "one match, in Path of Exile 2 — not ambiguous across games");
  assert.equal(row?.target?.game, "poe2");
  // The one still in a running league is offered its league; nothing else is.
  assert.equal(plan.rows.find((entry) => entry.name === "vSXVXRv")?.suggested, "0.5");

  const result = applyImport({ id: userId, username: "poe2-tester" }, exported, {
    include: () => true,
    leagueFor: () => null,
  });
  assert.deepEqual(result.written, ["PsevdoCrvb"]);
  const rows = db
    .prepare(
      `SELECT l.game, c.ascendancy, json_extract(c.data, '$.source') AS source, c.api_version
         FROM characters c JOIN leagues l ON l.id = c.league_id WHERE c.user_id = ? ORDER BY l.game`,
    )
    .all(userId) as { game: string; ascendancy: string | null; source: string; api_version: number }[];
  assert.deepEqual(rows[0], { game: "poe1", ascendancy: null, source: "manual", api_version: 0 });
  assert.equal(rows[1].game, "poe2");
  assert.equal(rows[1].ascendancy, "Smith of Kitava");
  assert.equal(rows[1].source, "poe2-site");
  const { POE2_SITE_VERSION } = await import("../src/lib/games/poe2/site-export");
  assert.equal(rows[1].api_version, POE2_SITE_VERSION);
});

/**
 * The two export mappers share the `api_version` column and move independently,
 * so a boot-time replay reads the build's own source to know which version it
 * is current at — or a Path of Exile 2 row would be run through Path of Exile
 * 1's mapper, or marked current at the wrong number and never re-derived.
 */
test("each export source is replayed against its own mapper's version", async () => {
  const { exportVersion, isExportSource } = await import("../src/lib/games/exports");
  const { POE_API_VERSION } = await import("../src/lib/games/poe1/poe-api");
  const { POE2_SITE_VERSION } = await import("../src/lib/games/poe2/site-export");
  assert.equal(exportVersion("poe2-site"), POE2_SITE_VERSION);
  assert.equal(exportVersion("poe-api"), POE_API_VERSION);
  assert.ok(isExportSource("poe2-site") && isExportSource("poe-api"));
  assert.ok(!isExportSource("pob") && !isExportSource("manual"));
});

/**
 * When a character's code outranks the export, the row's columns follow the
 * code: its level, class and main skill head the build it shows. The export's
 * are the character today, and the payload is still stored underneath.
 */
test("an overwrite onto a character with a code records the code's facts, not the export's", async () => {
  const { applyImport } = await import("../src/lib/import");
  const { db } = await import("../src/lib/db");
  const userId = db
    .prepare(`INSERT INTO users (username, first_name) VALUES ('poe2-code-overwrite', 'Test')`)
    .run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe2' AND slug = '0.2'`).get() as { id: number };
  const code = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "poe2-pob-0.2.txt"), "utf8").trim();
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, pob_code, data, parser_version)
     VALUES (?, ?, 'vsxvxrv', 'vSXVXRv', 'Warrior', ?, '{"source":"pob","items":[]}', 0)`,
  ).run(userId, league.id, code);

  const result = applyImport({ id: userId, username: "poe2-code-overwrite" }, await read(), {
    include: (name) => name === "vSXVXRv",
    leagueFor: () => null,
    overwrite: () => true,
  });
  assert.deepEqual(result.written, ["vSXVXRv"]);
  const row = db
    .prepare(`SELECT level, ascendancy, skill_gem, source_payload, data FROM characters WHERE user_id = ?`)
    .get(userId) as { level: number; ascendancy: string; skill_gem: string; source_payload: string | null; data: string };
  assert.equal(row.level, 92, "the code's level, not the export's 97");
  assert.equal(row.ascendancy, "Smith of Kitava");
  assert.equal(row.skill_gem, "Boneshatter");
  assert.equal(JSON.parse(row.data).level, 92);
  assert.ok(row.source_payload, "the export is kept underneath");
});

/**
 * A character the account holds nothing for is left out and named: importing
 * it would write an empty build and mark it archived, so every later import
 * would skip it as finished.
 */
test("a character with nothing equipped is left out of the import, and named", async () => {
  const { readAccountExport } = await import("../src/lib/games/exports");
  const file = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const stripped = file.characters[1];
  stripped.raw.items.data.equipment = [];
  const exported = readAccountExport(JSON.stringify(file));
  const name = String(stripped.raw.items.data.name ?? stripped.name);
  assert.deepEqual(exported.emptyCharacters, [name]);
  assert.ok(!exported.characters.some((character) => character.name === name));
  const whole = readAccountExport(fs.readFileSync(FIXTURE, "utf8"));
  assert.equal(exported.characters.length, whole.characters.length - 1);
  assert.deepEqual(whole.emptyCharacters, []);
});

/** A rare's name is random, and must not be searched for a base: it could name another item. */
test("a Path of Exile 2 rare is drawn by its base, never by its name", async () => {
  const { findItemArt } = await import("../src/lib/games/poe2/item-art");
  const base = "Ruby Ring";
  const byBase = findItemArt({ name: "Doom Loop", base, rarity: "RARE" });
  assert.ok(byBase, "the base resolves");
  // An unknown base with a name that happens to hold a real base's name.
  assert.equal(findItemArt({ name: "Ruby Ring Grip", base: "Not A Base", rarity: "RARE" }), null);
  // A magic item's name is its base with affixes, and is searched.
  assert.equal(findItemArt({ name: "Glinting Ruby Ring of the Fox", base: "Not A Base", rarity: "MAGIC" })?.src, byBase?.src);
});
