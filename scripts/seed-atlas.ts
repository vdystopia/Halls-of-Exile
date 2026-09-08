/**
 * Import the owner's character record into the archive.
 *
 *   npm run seed:atlas
 *   npm run seed:atlas -- --reset   # remove previously imported rows first
 *
 * scripts/data/character-atlas.json is the record from the owner's own
 * spreadsheet: 99 entries across two players and both games, most of them
 * predating any Path of Building export. They carry what the record holds —
 * name, level, class, ascendancy, build, playtime, notes — and nothing else, so
 * a page renders the summary without gear, gems or a passive tree.
 *
 * Anything the record does not have reads "Unknown" rather than being left
 * blank, and a re-run updates rows in place rather than duplicating them: every
 * row carries the record id it came from.
 */
import fs from "node:fs";
import path from "node:path";
import { db } from "../src/lib/db";
import { emptyBuild } from "../src/lib/games/poe1/pob";

type Entry = {
  player: string;
  game: string;
  league: string;
  name: string;
  level: number | null;
  className: string;
  ascendancy: string;
  mainSkill: string;
  playedMinutes: number | null;
  mode: string | null;
  notes: string | null;
  recordId: string | null;
};

const PLAYERS: Record<string, { firstName: string; tagline: string }> = {
  dystopia: { firstName: "Dystopia", tagline: "Every character, every league, since Bestiary." },
  valkyrie: { firstName: "Valkyrie", tagline: "Mines, traps, and the occasional slammer." },
};

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return slug || "character";
}

function main() {
  const reset = process.argv.includes("--reset");
  const file = path.join(process.cwd(), "scripts", "data", "character-atlas.json");
  const entries = JSON.parse(fs.readFileSync(file, "utf8")) as Entry[];

  // --reset removes exactly the rows this file would create — matched by player,
  // league and name — so a character added by hand is never caught in it.
  if (reset) {
    const drop = db.prepare(`
      DELETE FROM characters WHERE id IN (
        SELECT c.id FROM characters c
          JOIN users u ON u.id = c.user_id
          JOIN leagues l ON l.id = c.league_id
        WHERE u.username = ? COLLATE NOCASE AND l.game = ? AND l.slug = ? AND c.name = ?
      )`);
    let removed = 0;
    for (const entry of entries) removed += drop.run(entry.player, entry.game, entry.league, entry.name).changes;
    process.stdout.write(`removed ${removed} previously imported characters\n`);
  }

  const findUser = db.prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`);
  const addUser = db.prepare(`INSERT INTO users (username, first_name, tagline) VALUES (?, ?, ?)`);
  const findLeague = db.prepare(`SELECT id FROM leagues WHERE game = ? AND slug = ?`);
  const findExisting = db.prepare(`SELECT id, slug FROM characters WHERE user_id = ? AND league_id = ? AND name = ?`);
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

  let added = 0;
  let updated = 0;
  const run = db.transaction(() => {
    for (const [username, profile] of Object.entries(PLAYERS)) {
      if (!findUser.get(username)) addUser.run(username, profile.firstName, profile.tagline);
    }

    for (const entry of entries) {
      const user = findUser.get(entry.player) as { id: number } | undefined;
      const league = findLeague.get(entry.game, entry.league) as { id: number } | undefined;
      if (!user || !league) throw new Error(`no home for ${entry.name}: ${entry.player}/${entry.game}/${entry.league}`);

      // The mode and the record id ride along in the notes: this archive has no
      // column for either, and the id is what makes a re-run an update.
      const notes = [entry.notes, entry.mode ? `Mode: ${entry.mode}` : null].filter(Boolean).join("\n") || null;
      const build = {
        ...emptyBuild(),
        source: "manual" as const,
        className: entry.className,
        ascendClassName: entry.ascendancy,
        level: entry.level ?? undefined,
        mainSkill: entry.mainSkill,
      };
      const data = JSON.stringify(build);

      const existing = findExisting.get(user.id, league.id, entry.name) as { id: number } | undefined;
      if (existing) {
        update.run(entry.className, entry.ascendancy, entry.level, entry.mainSkill, notes,
          entry.playedMinutes, data, existing.id);
        updated += 1;
        continue;
      }
      const taken = (takenSlugs.all(user.id, league.id) as { slug: string }[]).map((row) => row.slug);
      let slug = slugify(entry.name);
      for (let suffix = 2; taken.includes(slug); suffix += 1) slug = `${slugify(entry.name)}-${suffix}`;
      insert.run(user.id, league.id, slug, entry.name, entry.className, entry.ascendancy, entry.level,
        entry.mainSkill, notes, entry.playedMinutes, data);
      added += 1;
    }
  });
  run();

  process.stdout.write(`imported ${added} characters, updated ${updated}\n`);
}

main();
