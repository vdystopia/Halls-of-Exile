import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.ARCHIVE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "halls-export-")), "archive.db");

test("a player export holds their archive, every league it refers to, and nobody else's", async () => {
  const { db } = await import("../src/lib/db");
  const { buildPlayerExport, exportFileName, EXPORT_FORMAT, EXPORT_VERSION } = await import("../src/lib/export");

  const add = (username: string) =>
    db.prepare(`INSERT INTO users (username, first_name, tagline) VALUES (?, 'Test', 'hi')`).run(username)
      .lastInsertRowid as number;
  const alice = add("Alice");
  const bob = add("bob");

  const builtIn = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' AND slug = '3.25'`).get() as { id: number };
  const custom = db
    .prepare(`INSERT INTO leagues (game, slug, patch, name, is_custom, sort_order) VALUES ('poe1', 'my-race', NULL, 'My Race', 1, 999)`)
    .run().lastInsertRowid as number;
  const recordOnly = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' AND slug = '3.20'`).get() as { id: number };

  const build = { source: "pob", stats: { Life: 5000 }, skillGroups: [], items: [], slots: {}, trees: [], activeTree: 0, config: [] };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, ascendancy, level, is_favorite, pob_code, data, parser_version)
     VALUES (?, ?, 'arrow', 'Arrow', 'Ranger', 'Deadeye', 95, 1, 'eNpVjc', ?, 3)`,
  ).run(alice, builtIn.id, JSON.stringify(build));
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data) VALUES (?, ?, 'racer', 'Racer', 'Unknown', 'not json')`,
  ).run(alice, custom);
  db.prepare(`INSERT INTO characters (user_id, league_id, slug, name, class_name) VALUES (?, ?, 'other', 'Other', 'Witch')`).run(
    bob,
    builtIn.id,
  );
  db.prepare(`INSERT INTO league_records (user_id, league_id, challenges_completed, notes) VALUES (?, ?, 36, 'good')`).run(
    alice,
    recordOnly.id,
  );

  const now = new Date("2026-09-23T12:00:00Z");
  const archive = buildPlayerExport("alice", now);
  assert.ok(archive);
  assert.equal(archive.format, EXPORT_FORMAT);
  assert.equal(archive.version, EXPORT_VERSION);
  assert.equal(archive.player.username, "Alice");
  assert.equal(archive.player.tagline, "hi");

  assert.deepEqual(archive.characters.map((c) => c.name).sort(), ["Arrow", "Racer"]);
  const arrow = archive.characters.find((c) => c.name === "Arrow")!;
  assert.deepEqual(arrow.league, { game: "poe1", slug: "3.25" });
  assert.equal(arrow.isFavorite, true);
  assert.equal(arrow.pobCode, "eNpVjc");
  assert.equal(arrow.parserVersion, 3);
  assert.deepEqual(arrow.build, build);
  // A build that does not parse is exported empty rather than failing the export.
  assert.deepEqual(archive.characters.find((c) => c.name === "Racer")!.build, {});

  // Every reference resolves, and only referenced leagues are carried.
  const keys = new Set(archive.leagues.map((l) => `${l.game}/${l.slug}`));
  assert.deepEqual([...keys].sort(), ["poe1/3.20", "poe1/3.25", "poe1/my-race"]);
  for (const ref of [...archive.characters, ...archive.leagueRecords].map((entry) => entry.league)) {
    assert.ok(keys.has(`${ref.game}/${ref.slug}`), `${ref.game}/${ref.slug} is not in leagues`);
  }
  assert.equal(archive.leagues.find((l) => l.slug === "my-race")!.isCustom, true);
  assert.equal(archive.leagues.find((l) => l.slug === "3.25")!.isCustom, false);
  assert.deepEqual(archive.leagueRecords, [
    { league: { game: "poe1", slug: "3.20" }, challengesCompleted: 36, challengeTotal: null, notes: "good" },
  ]);

  // It survives a JSON round trip unchanged: nothing in it is a Date, a Buffer or undefined.
  assert.deepEqual(JSON.parse(JSON.stringify(archive)), archive);
  assert.equal(exportFileName("Alice", now), "halls-of-exile-Alice-2026-09-23.json");
  assert.equal(buildPlayerExport("nobody"), null);
});

test("the documented format lists every field the export writes", async () => {
  const { buildPlayerExport } = await import("../src/lib/export");
  const archive = buildPlayerExport("alice")!;
  const doc = fs.readFileSync(path.join(__dirname, "..", "docs", "export-format.md"), "utf8");
  const fields = new Set([
    ...Object.keys(archive),
    ...Object.keys(archive.player),
    ...Object.keys(archive.leagues[0]),
    ...Object.keys(archive.leagueRecords[0]),
    ...Object.keys(archive.characters[0]),
  ]);
  for (const field of fields) assert.ok(doc.includes(`\`${field}\``), `docs/export-format.md does not document ${field}`);
});
