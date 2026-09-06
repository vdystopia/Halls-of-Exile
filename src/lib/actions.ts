"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { emptyBuild, fetchPobCode, isPobUrl, parsePob, PARSER_VERSION, PobError } from "./pob";
import { parsePlayed } from "./format";
import { getLeagueByPatch, getUser } from "./queries";
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
  const patch = text(formData, "patch");
  const user = getUser(username);
  const league = getLeagueByPatch(patch);
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
       (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill, notes, played_minutes,
        is_favorite, pob_code, pob_url, data, parser_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    user.id,
    league.id,
    slug,
    name,
    className,
    ascendancy,
    level,
    mainSkill,
    notes,
    playedMinutes,
    favorite,
    parsed.code,
    parsed.url,
    JSON.stringify(data),
    PARSER_VERSION,
  );

  revalidatePath(`/players/${username}`);
  revalidatePath(`/players/${username}/${patch}`);
  redirect(`/players/${username}/${patch}/${slug}`);
}

export async function updateCharacterAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = text(formData, "username");
  const patch = text(formData, "patch");
  const slug = text(formData, "slug");
  const user = getUser(username);
  const league = getLeagueByPatch(patch);
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
  const playedMinutes = parsePlayed(text(formData, "played"));
  const favorite = formData.get("favorite") ? 1 : 0;

  db.prepare(
    `UPDATE characters SET
       name        = COALESCE(NULLIF(?, ''), name),
       level       = COALESCE(?, level),
       main_skill  = COALESCE(NULLIF(?, ''), main_skill),
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

  revalidatePath(`/players/${username}/${patch}/${slug}`);
  return { ok: true };
}

export async function deleteCharacterAction(formData: FormData): Promise<void> {
  const username = text(formData, "username");
  const patch = text(formData, "patch");
  const slug = text(formData, "slug");
  const user = getUser(username);
  const league = getLeagueByPatch(patch);
  if (!user || !league) return;

  db.prepare(`DELETE FROM characters WHERE user_id = ? AND league_id = ? AND slug = ?`).run(
    user.id,
    league.id,
    slug,
  );
  revalidatePath(`/players/${username}`);
  redirect(`/players/${username}/${patch}`);
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
  const patch = text(formData, "patch");
  const user = getUser(username);
  const league = getLeagueByPatch(patch);
  if (!user || !league) return { error: "Unknown player or league." };

  const completed = integer(formData, "challengesCompleted");
  const total = integer(formData, "challengeTotal");
  const notes = text(formData, "notes") || null;

  if (completed !== null && completed < 0) return { error: "Challenges completed cannot be negative." };
  if (total !== null && total <= 0) return { error: "Challenge total must be positive." };
  if (completed !== null && (total ?? league.challengeTotal) < completed) {
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
  revalidatePath(`/players/${username}/${patch}`);
  return { ok: true };
}

export async function addLeagueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const patch = text(formData, "patch");
  const name = text(formData, "name");
  const startDate = text(formData, "startDate") || null;
  const endDate = text(formData, "endDate") || null;
  const challengeTotal = integer(formData, "challengeTotal") ?? 40;
  const endDateEstimated = formData.get("endDateEstimated") ? 1 : 0;
  const returnTo = text(formData, "returnTo");

  if (!/^\d+(\.\d+)*[a-z]?$/i.test(patch)) return { error: "Patch should look like 3.29 or 3.25.3." };
  if (!name) return { error: "League name is required." };
  if (db.prepare(`SELECT 1 FROM leagues WHERE patch = ?`).get(patch)) {
    return { error: `Patch ${patch} is already in the archive.` };
  }

  const maxOrder = (db.prepare(`SELECT MAX(sort_order) AS value FROM leagues`).get() as { value: number | null })
    .value;
  db.prepare(
    `INSERT INTO leagues
       (patch, name, expansion, start_date, end_date, end_date_estimated, challenge_total, is_custom, sort_order)
     VALUES (?, ?, NULL, ?, ?, ?, ?, 1, ?)`,
  ).run(patch, name, startDate, endDate, endDateEstimated, challengeTotal, (maxOrder ?? 0) + 10);

  revalidatePath(returnTo || "/players");
  return { ok: true };
}
