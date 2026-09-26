"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { parseCodeFor, parserVersionFor } from "./games/builds";
import { emptyBuild, fetchPobCode, isPobUrl, PobError } from "./games/poe1/pob";
import { isGameId, type GameId } from "./games/types";
import { exportVersion, PoeExportError, readAccountExport, rebuildFromStored, type AccountExport } from "./games/exports";
import { ascendanciesFor } from "./games/classes";
import {
  applyImport,
  planFor,
  readStaged,
  stageExport,
  type ImportPlan,
} from "./import";
import { parsePlayed } from "./format";
import { formatLeagueModifiers } from "./league-modifiers";
import { findNamesake, getLeague, getUser } from "./queries";
import { resyncLeagueOrder } from "./db";
import type { BuildData } from "./types";
import { usernameProblem } from "./usernames";

export type ActionState = {
  error?: string;
  ok?: boolean;
  /**
   * The name is already archived in this game. The add form shows where, and
   * offers to overwrite that character or cancel; nothing was written.
   */
  conflict?: { name: string; leagueTitle: string; href: string };
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function integer(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

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

function uniqueSlug(userId: number, leagueId: number, base: string, ignoreId?: number): string {
  const taken = db
    .prepare(`SELECT slug FROM characters WHERE user_id = ? AND league_id = ? AND id IS NOT ?`)
    .all(userId, leagueId, ignoreId ?? null)
    .map((row) => (row as { slug: string }).slug);
  if (!taken.includes(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

export async function createPlayerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = text(formData, "username");
  const firstName = text(formData, "firstName");
  const tagline = text(formData, "tagline");

  const problem = usernameProblem(username);
  if (problem) return { error: problem };
  if (!firstName || firstName.length > 40) {
    return { error: "First name is required (40 characters max)." };
  }
  if (db.prepare(`SELECT 1 FROM users WHERE username = ? COLLATE NOCASE`).get(username)) {
    return { error: `The name "${username}" is already in the archive.` };
  }

  db.prepare(`INSERT INTO users (username, first_name, tagline) VALUES (?, ?, ?)`).run(
    username,
    firstName,
    tagline || null,
  );

  revalidatePath("/players");
  redirect(`/players/${username}`);
}

async function buildFromForm(
  formData: FormData,
  game: GameId,
): Promise<{ data: BuildData; code: string | null; url: string | null }> {
  const mode = text(formData, "mode") || "manual";
  if (mode !== "pob") return { data: emptyBuild(), code: null, url: null };

  const input = text(formData, "pobInput");
  if (!input) throw new PobError("Paste a Path of Building code or a pobb.in / pastebin link.");
  const url = isPobUrl(input) ? input : null;
  const code = url ? await fetchPobCode(url) : input;
  // Read by the character's own game's parser, which refuses the other game's code.
  return { data: parseCodeFor(game, code), code, url };
}

function manualStats(formData: FormData): Record<string, number> {
  const stats: Record<string, number> = {};
  const map: [string, string][] = [
    ["life", "Life"],
    ["energyShield", "EnergyShield"],
    ["dps", "FullDPS"],
  ];
  for (const [field, key] of map) {
    const value = integer(formData, field);
    if (value !== null && value > 0) stats[key] = value;
  }
  return stats;
}

export async function addCharacterAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = text(formData, "username");
  const game = text(formData, "game");
  const leagueSlug = text(formData, "league");
  const user = getUser(username);
  const league = getLeague(game, leagueSlug);
  if (!user || !league) return { error: "Unknown player or league." };

  let parsed: { data: BuildData; code: string | null; url: string | null };
  try {
    parsed = await buildFromForm(formData, league.game);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not read that build." };
  }

  const data = parsed.data;
  const name = text(formData, "name") || data.mainSkill || "Unnamed Exile";
  // One name, one character, per game. Adding a name that is already archived
  // asks first; confirming replaces that character with this one.
  const namesake = findNamesake(user.id, league.game, name);
  if (namesake && formData.get("overwrite") !== "1") {
    return {
      conflict: {
        name,
        leagueTitle: namesake.leagueTitle,
        href: `/players/${username}/${league.game}/${namesake.leagueSlug}/${namesake.slug}`,
      },
    };
  }
  const className = text(formData, "className") || data.className || "Unknown";
  const ascendancy = text(formData, "ascendancy") || data.ascendClassName || null;
  const level = integer(formData, "level") ?? data.level ?? null;
  // The field's min and max are the browser's; a request can say anything.
  if (level !== null && (level < 1 || level > 100)) return { error: "Level must be a whole number from 1 to 100." };
  const mainSkill = text(formData, "mainSkill") || data.mainSkill || null;
  // The exact gem, for the picture beside the name. A parsed build names one and
  // spells it the way the game does; the field beside it takes the owner's own
  // words for the build, which are prose and resolve to no gem at all.
  const skillGem = text(formData, "skillGem") || (data.source === "manual" ? null : data.mainSkill) || null;
  const leagueModifiers = formatLeagueModifiers(formData.getAll("leagueModifiers").map(String));
  const notes = text(formData, "notes") || null;
  const playedMinutes = parsePlayed(text(formData, "played"));
  const favorite = formData.get("favorite") ? 1 : 0;

  if (data.source === "manual") {
    data.className = className;
    data.ascendClassName = ascendancy ?? undefined;
    data.level = level ?? undefined;
    data.mainSkill = mainSkill ?? undefined;
    data.stats = manualStats(formData);
  }

  // Replacing a namesake is one step: were the insert to fail after the delete,
  // the character being replaced would be gone with nothing in its place.
  const replace = db.transaction(() => {
    if (namesake) db.prepare(`DELETE FROM characters WHERE id = ?`).run(namesake.id);
    const slug = uniqueSlug(user.id, league.id, slugify(name));

    db.prepare(
      `INSERT INTO characters
         (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill, skill_gem,
          league_modifiers, notes, played_minutes, is_favorite, pob_code, pob_url, data, parser_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      user.id,
      league.id,
      slug,
      name,
      className,
      ascendancy,
      level,
      mainSkill,
      skillGem,
      leagueModifiers,
      notes,
      playedMinutes,
      favorite,
      parsed.code,
      parsed.url,
      JSON.stringify(data),
      parserVersionFor(league.game),
    );
    return slug;
  });
  const slug = replace();

  revalidatePath(`/players/${username}`);
  revalidatePath(`/players/${username}/${game}/${leagueSlug}`);
  redirect(`/players/${username}/${game}/${leagueSlug}/${slug}`);
}

export async function updateCharacterAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = text(formData, "username");
  const game = text(formData, "game");
  const leagueSlug = text(formData, "league");
  const slug = text(formData, "slug");
  const user = getUser(username);
  const league = getLeague(game, leagueSlug);
  if (!user || !league) return { error: "Unknown player or league." };

  const existing = db
    .prepare(`SELECT * FROM characters WHERE user_id = ? AND league_id = ? AND slug = ?`)
    .get(user.id, league.id, slug) as
    | {
        id: number;
        name: string;
        class_name: string;
        ascendancy: string | null;
        level: number | null;
        pob_code: string | null;
        source_payload: string | null;
      }
    | undefined;
  if (!existing) return { error: "Character not found." };

  // Moving a character is choosing another league of the same game: the league
  // is always picked by hand, so a wrong pick has to be correctable without
  // deleting the character and adding it again.
  const targetSlug = text(formData, "moveTo") || league.slug;
  const target = targetSlug === league.slug ? league : getLeague(league.game, targetSlug);
  if (!target) return { error: "That league is not in the archive." };

  const input = text(formData, "pobInput");
  const removeCode = formData.get("removeCode") === "on";
  let data: BuildData | null = null;
  let code: string | null = existing.pob_code;
  let url: string | null | undefined;
  let parserVersion: number | null = null;
  let apiVersion: number | null = null;

  if (input) {
    try {
      const link = isPobUrl(input) ? input : null;
      code = link ? await fetchPobCode(link) : input;
      data = parseCodeFor(league.game, code);
      // A raw code has no link, so the old one goes: "Source" would otherwise
      // point at the build this one replaced.
      url = link;
      parserVersion = parserVersionFor(league.game);
      // A code is the whole build in both games. For Path of Exile 2 that means
      // it replaces everything the site's export brought, gear included; the
      // export's payload stays on the row underneath (see `composePoe2Build`).
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not read that build." };
    }
  } else if (removeCode && existing.pob_code) {
    // Without its code a character falls back to what the game's own export
    // said, when it has one. With nothing else to build from, removing the code
    // would leave a build no source could ever re-derive, so it is refused.
    if (!existing.source_payload) {
      return {
        error:
          "This character has no other source: removing the code would leave a build nothing can re-derive. Paste a replacement code instead.",
      };
    }
    try {
      data = rebuildFromStored(JSON.parse(existing.source_payload));
    } catch {
      return { error: "The stored export no longer reads, so the code cannot be removed." };
    }
    code = null;
    url = null;
    apiVersion = exportVersion(data.source);
  }

  // Typed fields are the last word, as they are when a character is added. A
  // build pasted in the same save fills a field only where it was left as it
  // was: the form is pre-filled, so an untouched field still holds the old
  // value, and a code's level replacing a level typed beside it is not a choice
  // anyone made.
  const typedName = text(formData, "name") || existing.name;
  const typedLevel = text(formData, "level");
  const level = typedLevel ? Number(typedLevel) : null;
  if (typedLevel && (!Number.isInteger(level) || level! < 1 || level! > 100)) {
    return { error: "Level must be a whole number from 1 to 100." };
  }
  const untouched = (typed: string | number | null, current: string | number | null) => typed === current;
  const className = text(formData, "className") || existing.class_name;
  const ascendancy = text(formData, "ascendancy") || null;
  const classes = ascendanciesFor(league.game);
  if (className !== existing.class_name && !(className in classes)) {
    return { error: `${className} is not a class in this game.` };
  }
  const changed = className !== existing.class_name || ascendancy !== existing.ascendancy;
  if (ascendancy && changed && !(classes[className] ?? []).includes(ascendancy)) {
    return { error: `${ascendancy} is not an ascendancy of the ${className}.` };
  }
  const fromBuild = data && data.source !== "manual" ? data : null;
  const finalClass = (fromBuild && untouched(className, existing.class_name) ? fromBuild.className : null) || className;
  const finalAscendancy =
    (fromBuild && untouched(ascendancy, existing.ascendancy) ? fromBuild.ascendClassName : null) || ascendancy;
  const finalLevel = (fromBuild && untouched(level, existing.level) ? fromBuild.level : null) ?? level;

  // The record's own words for the build. A code names only the gem with the
  // most links, so it fills this when it is empty and never replaces it.
  const mainSkill = text(formData, "mainSkill") || fromBuild?.mainSkill || null;
  // Typed in by hand, so it is the last word: emptying the field clears the gem
  // rather than restoring whatever was there before. A build pasted in at the
  // same time fills it only when the field is left blank.
  const skillGem = text(formData, "skillGem") || fromBuild?.mainSkill || null;
  // Checkboxes, so the form states the whole set every time it is submitted and
  // unticking the last one clears the column. There is nothing to merge with:
  // an absent box means "not this", not "unknown".
  const leagueModifiers = formatLeagueModifiers(formData.getAll("leagueModifiers").map(String));
  const notes = text(formData, "notes");
  const playedMinutes = parsePlayed(text(formData, "played"));
  const favorite = formData.get("favorite") ? 1 : 0;

  // A new name or a new league is a new address. The slug follows the name, so
  // a renamed character is not left at a URL spelling its old one.
  const renamed = typedName !== existing.name;
  const namesake = renamed ? findNamesake(user.id, league.game, typedName, existing.id) : null;
  if (namesake) {
    return {
      error: `${typedName} is already archived in ${namesake.leagueTitle}. A name is unique within a game; rename or delete that one first.`,
    };
  }
  const moved = target.id !== league.id;
  const newSlug = renamed || moved ? uniqueSlug(user.id, target.id, slugify(typedName), existing.id) : slug;

  db.prepare(
    `UPDATE characters SET
       league_id   = ?,
       slug        = ?,
       name        = ?,
       level       = ?,
       main_skill  = ?,
       skill_gem   = ?,
       league_modifiers = ?,
       class_name  = ?,
       ascendancy  = ?,
       notes          = ?,
       played_minutes = ?,
       is_favorite    = ?,
       pob_code    = ?,
       pob_url     = CASE WHEN ? THEN ? ELSE pob_url END,
       data        = COALESCE(?, data),
       parser_version = COALESCE(?, parser_version),
       api_version    = COALESCE(?, api_version)
     WHERE id = ?`,
  ).run(
    target.id,
    newSlug,
    typedName,
    finalLevel,
    mainSkill,
    skillGem,
    leagueModifiers,
    finalClass,
    finalAscendancy,
    notes || null,
    playedMinutes,
    favorite,
    code,
    url !== undefined ? 1 : 0,
    url ?? null,
    data ? JSON.stringify(data) : null,
    parserVersion,
    apiVersion,
    existing.id,
  );

  revalidatePath(`/players/${username}`);
  revalidatePath(`/players/${username}/${game}/${leagueSlug}`);
  if (newSlug !== slug || moved) {
    revalidatePath(`/players/${username}/${game}/${target.slug}`);
    redirect(`/players/${username}/${game}/${target.slug}/${newSlug}`);
  }
  revalidatePath(`/players/${username}/${game}/${leagueSlug}/${slug}`);
  return { ok: true };
}

export async function deleteCharacterAction(formData: FormData): Promise<void> {
  const username = text(formData, "username");
  const game = text(formData, "game");
  const leagueSlug = text(formData, "league");
  const slug = text(formData, "slug");
  const user = getUser(username);
  const league = getLeague(game, leagueSlug);
  if (!user || !league) return;

  db.prepare(`DELETE FROM characters WHERE user_id = ? AND league_id = ? AND slug = ?`).run(
    user.id,
    league.id,
    slug,
  );
  revalidatePath(`/players/${username}`);
  redirect(`/players/${username}/${game}/${leagueSlug}`);
}

/**
 * Rename a player, or change the name shown beside their handle. The username
 * is the archive's URL for them, so this moves every one of their pages —
 * characters and league records travel by id and are untouched.
 */
export async function renamePlayerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const current = text(formData, "username");
  const username = text(formData, "newUsername");
  const firstName = text(formData, "firstName");
  const tagline = text(formData, "tagline") || null;
  const poeAccount = text(formData, "poeAccount") || null;

  const user = getUser(current);
  if (!user) return { error: "That player is no longer in the archive." };
  const problem = usernameProblem(username);
  if (problem) return { error: problem };
  if (!firstName || firstName.length > 40) {
    return { error: "Display name is required (40 characters max)." };
  }
  // COLLATE NOCASE, so "Dystopia" does not collide with the row's own "dystopia".
  const clash = db
    .prepare(`SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id <> ?`)
    .get(username, user.id);
  if (clash) return { error: `The name "${username}" is already in the archive.` };

  // The account is what an export is matched to a player by, so two players
  // cannot claim one. It is stored as typed, and compared case-insensitively.
  if (poeAccount) {
    const taken = db
      .prepare(`SELECT username FROM users WHERE poe_account = ? COLLATE NOCASE AND id <> ?`)
      .get(poeAccount, user.id) as { username: string } | undefined;
    if (taken) return { error: `That account is already on ${taken.username}.` };
  }

  db.prepare(`UPDATE users SET username = ?, first_name = ?, tagline = ?, poe_account = ? WHERE id = ?`).run(
    username,
    firstName,
    tagline,
    poeAccount,
    user.id,
  );
  revalidatePath("/players");
  revalidatePath("/");
  revalidatePath(`/players/${current}`);
  redirect(`/players/${username}`);
}

/**
 * Removing a player takes their characters and league records with them: both
 * tables declare ON DELETE CASCADE and the connection runs with foreign keys
 * on. There is no undo, which is why the button asks first.
 */
export async function deletePlayerAction(formData: FormData): Promise<void> {
  const username = text(formData, "username");
  const user = getUser(username);
  if (!user) return;

  db.prepare(`DELETE FROM users WHERE id = ?`).run(user.id);
  revalidatePath("/players");
  revalidatePath("/");
  redirect("/players");
}

export async function saveLeagueRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = text(formData, "username");
  const game = text(formData, "game");
  const leagueSlug = text(formData, "league");
  const user = getUser(username);
  const league = getLeague(game, leagueSlug);
  if (!user || !league) return { error: "Unknown player or league." };

  const completed = integer(formData, "challengesCompleted");
  // The same figure as the catalogue's is not an override: stored, it would
  // freeze today's total for this player against any later correction.
  const typedTotal = integer(formData, "challengeTotal");
  const total = typedTotal === league.challengeTotal ? null : typedTotal;
  const notes = text(formData, "notes") || null;

  if (completed !== null && completed < 0) return { error: "Challenges completed cannot be negative." };
  if (total !== null && total <= 0) return { error: "Challenge total must be positive." };
  // A league with no recorded total cannot contradict a completed count.
  const ceiling = total ?? league.challengeTotal;
  if (completed !== null && ceiling !== null && ceiling < completed) {
    return { error: "Challenges completed cannot exceed the league total." };
  }

  db.prepare(
    `INSERT INTO league_records (user_id, league_id, challenges_completed, challenge_total, notes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, league_id) DO UPDATE SET
       challenges_completed = excluded.challenges_completed,
       challenge_total      = excluded.challenge_total,
       notes                = excluded.notes`,
  ).run(user.id, league.id, completed, total, notes);

  revalidatePath(`/players/${username}`);
  revalidatePath(`/players/${username}/${game}/${leagueSlug}`);
  return { ok: true };
}

/** The fields a hand-added league takes, checked the same way for adding and editing. */
function leagueFields(
  formData: FormData,
  game: GameId,
  slug: string | null,
): { error: string } | {
  name: string;
  startDate: string | null;
  endDate: string | null;
  endDateEstimated: 0 | 1;
  challengeTotal: number | null;
} {
  const name = text(formData, "name");
  const startDate = text(formData, "startDate") || null;
  const endDate = text(formData, "endDate") || null;
  // Blank is unknown. Defaulting to 40 put a count nobody gave on every league
  // added, and a meter measuring against it.
  const challengeTotal = integer(formData, "challengeTotal");
  const endDateEstimated = formData.get("endDateEstimated") ? 1 : 0;
  if (!name) return { error: "League name is required." };
  if (startDate && endDate && endDate < startDate) return { error: "The league cannot end before it starts." };
  if (challengeTotal !== null && challengeTotal <= 0) return { error: "Challenge total must be positive." };
  // Only a game's newest league may carry an estimated end date: every older
  // one has ended, and its end is a fact.
  if (endDateEstimated) {
    const newest = db
      .prepare(`SELECT MAX(start_date) AS value FROM leagues WHERE game = ? AND slug IS NOT ?`)
      .get(game, slug) as { value: string | null };
    if (!startDate || (newest.value && startDate <= newest.value)) {
      return { error: "Only the game's newest league can have an estimated end date." };
    }
  }
  return { name, startDate, endDate, endDateEstimated, challengeTotal };
}

export async function addLeagueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const game = text(formData, "game");
  const patch = text(formData, "patch");
  const returnTo = text(formData, "returnTo");

  // Checked, because every page that shows the league looks its game up.
  if (!isGameId(game)) return { error: "Choose Path of Exile or Path of Exile 2." };
  if (!/^\d+(\.\d+)*[a-z]?$/i.test(patch)) return { error: "Patch should look like 3.29 or 0.5.5." };
  // A hand-added league is keyed on its patch within its game, the same way the
  // catalogue is keyed on (game, slug). When the catalogue later gains that
  // patch, the sync adopts this row as the official one.
  if (db.prepare(`SELECT 1 FROM leagues WHERE game = ? AND slug = ?`).get(game, patch)) {
    return { error: `Patch ${patch} is already in the archive.` };
  }
  const fields = leagueFields(formData, game, null);
  if ("error" in fields) return fields;

  db.prepare(
    `INSERT INTO leagues
       (game, slug, patch, name, expansion, start_date, end_date, end_date_estimated, challenge_total,
        is_custom, sort_order)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, 0)`,
  ).run(game, patch, patch, fields.name, fields.startDate, fields.endDate, fields.endDateEstimated, fields.challengeTotal);
  // Placed among the others by date, as the boot-time sync does.
  resyncLeagueOrder();

  revalidatePath(returnTo || "/players");
  return { ok: true };
}

/** A hand-added league's own facts. The catalogue's rows are code-owned and never edited here. */
export async function updateLeagueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const game = text(formData, "game");
  const slug = text(formData, "slug");
  const returnTo = text(formData, "returnTo");
  if (!isGameId(game)) return { error: "Unknown game." };
  const row = db.prepare(`SELECT id, is_custom FROM leagues WHERE game = ? AND slug = ?`).get(game, slug) as
    | { id: number; is_custom: number }
    | undefined;
  if (!row) return { error: "That league is not in the archive." };
  if (!row.is_custom) return { error: "The catalogue's leagues are fixed in code and cannot be edited here." };
  const fields = leagueFields(formData, game, slug);
  if ("error" in fields) return fields;

  db.prepare(
    `UPDATE leagues SET name = ?, start_date = ?, end_date = ?, end_date_estimated = ?, challenge_total = ?
      WHERE id = ?`,
  ).run(fields.name, fields.startDate, fields.endDate, fields.endDateEstimated, fields.challengeTotal, row.id);
  resyncLeagueOrder();

  revalidatePath(returnTo || "/players");
  return { ok: true };
}

/**
 * Removing a hand-added league. Only an empty one: a league holding characters
 * or anyone's league record would take them with it, so those have to be moved
 * or deleted first, by name.
 */
export async function deleteLeagueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const game = text(formData, "game");
  const slug = text(formData, "slug");
  const returnTo = text(formData, "returnTo") || "/players";
  const row = db.prepare(`SELECT id, is_custom FROM leagues WHERE game = ? AND slug = ?`).get(game, slug) as
    | { id: number; is_custom: number }
    | undefined;
  if (!row) return { error: "That league is not in the archive." };
  if (!row.is_custom) return { error: "The catalogue's leagues are fixed in code and cannot be deleted here." };
  const held = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM characters WHERE league_id = ?) AS characters,
              (SELECT COUNT(*) FROM league_records WHERE league_id = ?) AS records`,
    )
    .get(row.id, row.id) as { characters: number; records: number };
  if (held.characters || held.records) {
    return {
      error: `This league still holds ${held.characters} character(s) and ${held.records} league record(s). Move or delete them first.`,
    };
  }
  db.prepare(`DELETE FROM leagues WHERE id = ?`).run(row.id);
  revalidatePath("/players");
  redirect(returnTo);
}

/**
 * The upload page's two buttons. Everything they do lives in `src/lib/import.ts`,
 * because the ingest endpoint does the same work without a person watching.
 */
export type ImportState = ActionState & { plan?: ImportPlan; imported?: number; created?: number };

/** The upload itself, or the staged copy of one already looked at. */
async function readUpload(formData: FormData): Promise<{ exported: AccountExport; token: string }> {
  const file = formData.get("export");
  if (file instanceof File && file.size > 0) {
    const body = await file.text();
    const exported = readAccountExport(body);
    return { exported, token: stageExport(body) };
  }
  const token = text(formData, "token");
  if (!token) throw new PoeExportError("Choose the export JSON file first.");
  return { exported: readStaged(token), token };
}

export async function previewPoeExportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = getUser(text(formData, "username"));
  if (!user) return { error: "Unknown player." };
  try {
    const { exported, token } = await readUpload(formData);
    return { plan: planFor(user.id, exported, token) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not read that export." };
  }
}

export async function importPoeExportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const username = text(formData, "username");
  const user = getUser(username);
  if (!user) return { error: "Unknown player." };

  let exported: AccountExport;
  let token: string;
  try {
    ({ exported, token } = await readUpload(formData));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not read that export." };
  }

  // Ticking a row that already holds a build is the manual order to replace it:
  // the box is unticked by default and labelled, so it cannot happen by
  // accident, which is the only way an archived character is ever rewritten.
  const { imported, created, touched } = applyImport(user, exported, {
    include: (name) => Boolean(formData.get(`include:${name}`)),
    leagueFor: (name) => text(formData, `league:${name}`) || null,
    overwrite: (name) => Boolean(formData.get(`include:${name}`)),
    // The field is on the page whether it was typed into or not, so what comes
    // back is whatever the row was showing — the archived skill, the exporter's
    // guess, or a correction. Emptying it deliberately is the one way to send
    // nothing, and that falls back to the old order rather than clearing the
    // column: this page adds characters, and nothing here should be able to
    // strip a fact off one by being left blank.
    skillFor: (name) => text(formData, `skill:${name}`) || null,
  });

  revalidatePath("/");
  revalidatePath(`/players/${username}`);
  for (const key of touched) revalidatePath(`/players/${username}/${key}`);
  return { ok: true, imported, created, plan: planFor(user.id, exported, token) };
}
