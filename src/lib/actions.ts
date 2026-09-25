"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { emptyBuild, fetchPobCode, isPobUrl, parsePob, PARSER_VERSION, PobError } from "./games/poe1/pob";
import { PoeExportError, readAccountExport, type AccountExport } from "./games/exports";
import {
  applyImport,
  planFor,
  readStaged,
  stageExport,
  type ImportPlan,
} from "./import";
import { parsePlayed } from "./format";
import { formatLeagueModifiers } from "./league-modifiers";
import { getLeague, getUser } from "./queries";
import type { BuildData } from "./types";

export type ActionState = { error?: string; ok?: boolean };

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;

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

  if (!USERNAME_RE.test(username)) {
    return { error: "Username must be 3-24 characters: letters, numbers, hyphen or underscore." };
  }
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

async function buildFromForm(formData: FormData): Promise<{ data: BuildData; code: string | null; url: string | null }> {
  const mode = text(formData, "mode") || "manual";
  if (mode !== "pob") return { data: emptyBuild(), code: null, url: null };

  const input = text(formData, "pobInput");
  if (!input) throw new PobError("Paste a Path of Building code or a pobb.in / pastebin link.");
  const url = isPobUrl(input) ? input : null;
  const code = url ? await fetchPobCode(url) : input;
  return { data: parsePob(code), code, url };
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
    parsed = await buildFromForm(formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not read that build." };
  }

  const data = parsed.data;
  const name = text(formData, "name") || data.mainSkill || "Unnamed Exile";
  const className = text(formData, "className") || data.className || "Unknown";
  const ascendancy = text(formData, "ascendancy") || data.ascendClassName || null;
  const level = integer(formData, "level") ?? data.level ?? null;
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
    PARSER_VERSION,
  );

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
    .get(user.id, league.id, slug) as { id: number; data: string } | undefined;
  if (!existing) return { error: "Character not found." };

  const input = text(formData, "pobInput");
  let data: BuildData | null = null;
  let code: string | null = null;
  let url: string | null = null;

  if (input) {
    try {
      url = isPobUrl(input) ? input : null;
      code = url ? await fetchPobCode(url) : input;
      data = parsePob(code);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not read that build." };
    }
  }

  const name = text(formData, "name");
  const level = integer(formData, "level");
  const notes = text(formData, "notes");
  // Typed in by hand, so it is the last word: emptying the field clears the gem
  // rather than restoring whatever was there before. A build pasted in at the
  // same time fills it only when the field is left blank.
  const skillGem = text(formData, "skillGem") || data?.mainSkill || null;
  // Checkboxes, so the form states the whole set every time it is submitted and
  // unticking the last one clears the column. There is nothing to merge with:
  // an absent box means "not this", not "unknown".
  const leagueModifiers = formatLeagueModifiers(formData.getAll("leagueModifiers").map(String));
  const playedMinutes = parsePlayed(text(formData, "played"));
  const favorite = formData.get("favorite") ? 1 : 0;

  db.prepare(
    `UPDATE characters SET
       name        = COALESCE(NULLIF(?, ''), name),
       level       = COALESCE(?, level),
       main_skill  = COALESCE(NULLIF(?, ''), main_skill),
       skill_gem   = ?,
       league_modifiers = ?,
       class_name  = COALESCE(NULLIF(?, ''), class_name),
       ascendancy  = COALESCE(NULLIF(?, ''), ascendancy),
       notes          = ?,
       played_minutes = ?,
       is_favorite    = ?,
       pob_code    = COALESCE(?, pob_code),
       pob_url     = COALESCE(?, pob_url),
       data        = COALESCE(?, data),
       parser_version = COALESCE(?, parser_version)
     WHERE id = ?`,
  ).run(
    name,
    data?.level ?? level,
    data?.mainSkill ?? "",
    skillGem,
    leagueModifiers,
    data?.className ?? "",
    data?.ascendClassName ?? "",
    notes || null,
    playedMinutes,
    favorite,
    code,
    url,
    data ? JSON.stringify(data) : null,
    data ? PARSER_VERSION : null,
    existing.id,
  );

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
 * Removing a player takes their characters and league records with them: both
 * tables declare ON DELETE CASCADE and the connection runs with foreign keys
 * on. There is no undo, which is why the button asks first.
 */
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
  if (!USERNAME_RE.test(username)) {
    return { error: "Username must be 3-24 characters: letters, numbers, hyphen or underscore." };
  }
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
  const total = integer(formData, "challengeTotal");
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

export async function addLeagueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const game = text(formData, "game") || "poe1";
  const patch = text(formData, "patch");
  const name = text(formData, "name");
  const startDate = text(formData, "startDate") || null;
  const endDate = text(formData, "endDate") || null;
  const challengeTotal = integer(formData, "challengeTotal") ?? 40;
  const endDateEstimated = formData.get("endDateEstimated") ? 1 : 0;
  const returnTo = text(formData, "returnTo");

  if (!/^\d+(\.\d+)*[a-z]?$/i.test(patch)) return { error: "Patch should look like 3.29 or 3.25.3." };
  if (!name) return { error: "League name is required." };
  // A hand-added league is keyed on its patch within its game, the same way the
  // catalogue is keyed on (game, slug).
  if (db.prepare(`SELECT 1 FROM leagues WHERE game = ? AND slug = ?`).get(game, patch)) {
    return { error: `Patch ${patch} is already in the archive.` };
  }

  const maxOrder = (db.prepare(`SELECT MAX(sort_order) AS value FROM leagues`).get() as { value: number | null })
    .value;
  db.prepare(
    `INSERT INTO leagues
       (game, slug, patch, name, expansion, start_date, end_date, end_date_estimated, challenge_total,
        is_custom, sort_order)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, ?)`,
  ).run(game, patch, patch, name, startDate, endDate, endDateEstimated, challengeTotal, (maxOrder ?? 0) + 10);

  revalidatePath(returnTo || "/players");
  return { ok: true };
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
