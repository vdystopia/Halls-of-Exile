/**
 * Import the owner's character record into the archive.
 *
 *   npm run seed:atlas                 # the development archive in ./data
 *   npm run seed:atlas -- --reset      # remove the rows this file owns, then re-import
 *
 * Against the deployed container, where the real archive lives on a volume the
 * host cannot safely touch:
 *
 *   docker compose exec halls node scripts/seed-atlas.mjs
 *
 * scripts/data/character-atlas.json is the record from the owner's own
 * spreadsheet: 99 entries across two players and both games, most of them
 * predating any Path of Building export. They carry what the record holds —
 * name, level, class, ascendancy, build, playtime, notes — and nothing else, so
 * a page renders the summary without gear, gems or a passive tree.
 *
 * Anything the record does not have reads "Unknown" rather than being left
 * blank. A re-run updates rows in place, matched on player, league and name.
 *
 * Written in plain JavaScript on purpose: the container has node and
 * better-sqlite3 but no TypeScript, and this has to run where the archive is.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.env.ARCHIVE_DB ?? path.join(process.cwd(), "data", "archive.db");
if (!fs.existsSync(source)) {
  console.error(`No archive found at ${source}. Start the site once so it creates one.`);
  process.exit(1);
}

const PLAYERS = {
  dystopia: { firstName: "Dystopia", tagline: "Every character, every league, since Bestiary." },
  valkyrie: { firstName: "Valkyrie", tagline: "Mines, traps, and the occasional slammer." },
};

/** The shape `mapCharacter` merges over: a manual entry with no build behind it. */
function manualBuild(entry) {
  return {
    source: "manual",
    className: entry.className,
    ascendClassName: entry.ascendancy,
    level: entry.level ?? undefined,
    mainSkill: entry.mainSkill,
    stats: {},
    skillGroups: [],
    items: [],
    slots: {},
    trees: [],
    activeTree: 0,
    treeJewels: [],
    config: [],
  };
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return slug || "character";
}

const reset = process.argv.includes("--reset");
const entries = JSON.parse(fs.readFileSync(path.join(here, "data", "character-atlas.json"), "utf8"));
const db = new Database(source);
db.pragma("foreign_keys = ON");

const findUser = db.prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`);
const addUser = db.prepare(`INSERT INTO users (username, first_name, tagline) VALUES (?, ?, ?)`);
const findLeague = db.prepare(`SELECT id FROM leagues WHERE game = ? AND slug = ?`);
const findExisting = db.prepare(`SELECT id FROM characters WHERE user_id = ? AND league_id = ? AND name = ?`);
const takenSlugs = db.prepare(`SELECT slug FROM characters WHERE user_id = ? AND league_id = ?`);
const insert = db.prepare(`
  INSERT INTO characters
    (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill, notes,
     played_minutes, is_favorite, pob_code, pob_url, data, parser_version)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, 0)
`);
const update = db.prepare(`
  UPDATE characters SET class_name = ?, ascendancy = ?, level = ?, main_skill = ?, notes = ?,
                        played_minutes = ?, data = ?
  WHERE id = ?
`);
// --reset removes exactly the rows this file owns — matched by player, league
// and name — so a character added by hand is never caught in it.
const drop = db.prepare(`
  DELETE FROM characters WHERE id IN (
    SELECT c.id FROM characters c
      JOIN users u ON u.id = c.user_id
      JOIN leagues l ON l.id = c.league_id
    WHERE u.username = ? COLLATE NOCASE AND l.game = ? AND l.slug = ? AND c.name = ?
  )`);

let added = 0;
let updated = 0;
let removed = 0;

const run = db.transaction(() => {
  if (reset) {
    for (const entry of entries) {
      removed += drop.run(entry.player, entry.game, entry.league, entry.name).changes;
    }
  }
  for (const [username, profile] of Object.entries(PLAYERS)) {
    if (!findUser.get(username)) addUser.run(username, profile.firstName, profile.tagline);
  }
  for (const entry of entries) {
    const user = findUser.get(entry.player);
    const league = findLeague.get(entry.game, entry.league);
    if (!user) throw new Error(`no player "${entry.player}" for ${entry.name}`);
    if (!league) {
      throw new Error(
        `no league ${entry.game}/${entry.league} for ${entry.name} — is the site running this version?`,
      );
    }

    // The mode rides along in the notes: the archive has no column for it.
    const notes = [entry.notes, entry.mode ? `Mode: ${entry.mode}` : null].filter(Boolean).join("\n") || null;
    const data = JSON.stringify(manualBuild(entry));

    const existing = findExisting.get(user.id, league.id, entry.name);
    if (existing) {
      update.run(entry.className, entry.ascendancy, entry.level, entry.mainSkill, notes,
        entry.playedMinutes, data, existing.id);
      updated += 1;
      continue;
    }
    const taken = takenSlugs.all(user.id, league.id).map((row) => row.slug);
    let slug = slugify(entry.name);
    for (let suffix = 2; taken.includes(slug); suffix += 1) slug = `${slugify(entry.name)}-${suffix}`;
    insert.run(user.id, league.id, slug, entry.name, entry.className, entry.ascendancy, entry.level,
      entry.mainSkill, notes, entry.playedMinutes, data);
    added += 1;
  }
});
run();

if (reset) process.stdout.write(`removed ${removed} previously imported characters\n`);
process.stdout.write(`imported ${added} characters, updated ${updated}\n`);
process.stdout.write(`archive: ${source}\n`);
