import { db } from "./db";
import { leagueTitle } from "./format";
import type { League } from "./types";

/**
 * A player's challenges, league by league, as pathofexile.com lists them.
 *
 * The site's account page has a Challenges tab that holds every league the
 * account ever saw, with each challenge's name, progress, description and
 * sub-items and whether it was completed — the one piece of league history
 * Grinding Gear Games keep in full. It is private to the signed-in account,
 * so it is read in a browser and handed over as one JSON file per account
 * (the shape below, produced by the prompt in the session of 2026-09-27),
 * which the import page takes.
 *
 * What the import does with a league depends on the site's own verdict:
 * - Challenges completed: every challenge row is stored in the site's order,
 *   and the league's record takes the completed count and, where the site's
 *   total differs from the catalogue's, the total. A league with challenges
 *   done counts as played for that player even with no character filed under
 *   it — Synthesis was played, whatever became of the characters.
 * - Zero completed: the owner's rule is that it was not played; nothing is
 *   stored and nothing is reported beyond a count.
 * - A Ruthless variant: never read, never stored.
 *
 * The site names leagues its own way ("Mercenary", "Ancestor", "Sanctum",
 * "Warbands/Tempest"), so `SITE_LEAGUES` maps each label onto the catalogue.
 * A label the map lacks that has challenges done is reported, not guessed.
 */

export type ChallengeSubtask = { text: string; completed: boolean };

export type Challenge = {
  /** 1-based, the order the site lists them in. */
  position: number;
  name: string;
  /** "6/6", "4/6", or null when the site shows only a tick or cross. */
  progress: string | null;
  completed: boolean;
  description: string | null;
  subtasks: ChallengeSubtask[];
};

export type ChallengeLeague =
  | { league: string; status: "played"; completed: number; total: number; challenges: Challenge[]; notes?: string }
  | { league: string; status: "not_participated"; completed: number; total: number | null }
  | { league: string; status: "skipped_ruthless" };

export type ChallengeFile = {
  account: string;
  retrievedAt: string | null;
  leagues: ChallengeLeague[];
  /** What could not be read as intended, each naming its league. */
  problems: string[];
};

export type ChallengeResult = {
  account: string;
  /** Leagues whose challenges were stored, by title, with the site's counts. */
  imported: { league: string; completed: number; total: number }[];
  /** Site labels with challenges done that the map does not know. Nothing was stored for them. */
  unmapped: { league: string; completed: number; total: number }[];
  /** Where the site's total disagrees with the catalogue's; the site's is stored as this player's override. */
  totalsDiffer: { league: string; site: number; catalogue: number | null }[];
  notParticipated: number;
  ruthless: number;
};

/** pathofexile.com's label for each league, by the catalogue's Path of Exile slug. */
export const SITE_LEAGUES: Record<string, string> = {
  "Domination/Nemesis": "1.0",
  "Ambush/Invasion": "1.1",
  "Rampage/Beyond": "1.2",
  "Torment/Bloodlines": "1.3",
  "Warbands/Tempest": "2.0",
  Talisman: "2.1",
  Perandus: "2.2",
  Prophecy: "2.3",
  Essence: "2.4",
  Breach: "2.5",
  Legacy: "2.6",
  Harbinger: "3.0",
  Abyss: "3.1",
  Bestiary: "3.2",
  Incursion: "3.3",
  Delve: "3.4",
  Betrayal: "3.5",
  Synthesis: "3.6",
  Legion: "3.7",
  Blight: "3.8",
  Metamorph: "3.9",
  Delirium: "3.10",
  Harvest: "3.11",
  Heist: "3.12",
  Ritual: "3.13",
  Ultimatum: "3.14",
  Expedition: "3.15",
  Scourge: "3.16",
  Archnemesis: "3.17",
  Sentinel: "3.18",
  "Lake of Kalandra": "3.19",
  Sanctum: "3.20",
  Crucible: "3.21",
  Ancestor: "3.22",
  Affliction: "3.23",
  Necropolis: "3.24",
  Settlers: "3.25",
  Mercenary: "3.26",
  Keepers: "3.27",
  Mirage: "3.28",
  Allflame: "3.29",
  // Not in the catalogue: "Anarchy/Onslaught" (0.11, before 1.0), "Flashback",
  // "Torment+Bloodlines 1-Month" and its HC twin. Reported if ever played.
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Read the file the browser produced. Bad leagues are reported and dropped; the rest are kept. */
export function readChallengeFile(text: string): ChallengeFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { account: "", retrievedAt: null, leagues: [], problems: ["The file is not JSON."] };
  }
  if (!isRecord(parsed) || typeof parsed.account !== "string" || !Array.isArray(parsed.leagues)) {
    return { account: "", retrievedAt: null, leagues: [], problems: ['The file needs "account" and a "leagues" list.'] };
  }
  const problems: string[] = [];
  const leagues: ChallengeLeague[] = [];
  for (const [index, entry] of parsed.leagues.entries()) {
    const where = `Entry ${index + 1}`;
    if (!isRecord(entry) || typeof entry.league !== "string" || !entry.league.trim()) {
      problems.push(`${where}: no league name.`);
      continue;
    }
    const league = entry.league.trim();
    if (entry.status === "skipped_ruthless") {
      leagues.push({ league, status: "skipped_ruthless" });
      continue;
    }
    const completed = Number(entry.completed);
    const total = entry.total === null || entry.total === undefined ? null : Number(entry.total);
    if (entry.status === "not_participated") {
      leagues.push({ league, status: "not_participated", completed: Number.isFinite(completed) ? completed : 0, total: Number.isFinite(total!) ? total : null });
      continue;
    }
    if (entry.status !== "played") {
      problems.push(`${where} (${league}): unknown status "${String(entry.status)}".`);
      continue;
    }
    if (!Number.isInteger(completed) || completed < 0 || !Number.isInteger(total) || total! <= 0) {
      problems.push(`${where} (${league}): completed and total must be whole numbers.`);
      continue;
    }
    if (!Array.isArray(entry.challenges) || entry.challenges.length === 0) {
      problems.push(`${where} (${league}): played, but no challenges listed.`);
      continue;
    }
    const challenges: Challenge[] = [];
    for (const [at, row] of entry.challenges.entries()) {
      if (!isRecord(row) || typeof row.name !== "string" || !row.name.trim()) {
        problems.push(`${league}, row ${at + 1}: no challenge name.`);
        continue;
      }
      const subtasks: ChallengeSubtask[] = [];
      for (const sub of Array.isArray(row.subtasks) ? row.subtasks : []) {
        if (!isRecord(sub) || typeof sub.text !== "string") continue;
        if (!sub.text.trim()) {
          problems.push(`${league}, "${row.name.trim()}": a sub-item with no text was dropped.`);
          continue;
        }
        subtasks.push({ text: sub.text.trim(), completed: Boolean(sub.completed) });
      }
      const progress = typeof row.progress === "string" && row.progress.trim() ? row.progress.trim() : null;
      challenges.push({
        position: Number.isInteger(row.position) ? (row.position as number) : at + 1,
        name: row.name.trim(),
        progress,
        completed: Boolean(row.completed),
        description: typeof row.description === "string" && row.description.trim() ? row.description.trim() : null,
        subtasks,
      });
    }
    challenges.sort((a, b) => a.position - b.position);
    const done = challenges.filter((c) => c.completed).length;
    if (done !== completed) {
      problems.push(`${league}: the header says ${completed} completed but ${done} rows are ticked; the header's count is stored.`);
    }
    leagues.push({ league, status: "played", completed, total: total!, challenges, ...(typeof entry.notes === "string" && entry.notes ? { notes: entry.notes } : {}) });
  }
  return {
    account: parsed.account.trim(),
    retrievedAt: typeof parsed.retrieved_at === "string" ? parsed.retrieved_at : null,
    leagues,
    problems,
  };
}

/** Store a player's challenges. One transaction; a league already stored is replaced, its notes kept. */
export function applyChallenges(userId: number, file: ChallengeFile, leagues: League[]): ChallengeResult {
  const result: ChallengeResult = { account: file.account, imported: [], unmapped: [], totalsDiffer: [], notParticipated: 0, ruthless: 0 };
  const clear = db.prepare(`DELETE FROM challenges WHERE user_id = ? AND league_id = ?`);
  const insert = db.prepare(
    `INSERT INTO challenges (user_id, league_id, position, name, progress, completed, description, subtasks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // The site's count is the record; the total is stored only where it
  // corrects the catalogue, the same rule the form follows. Notes are the
  // player's own and stay.
  const record = db.prepare(
    `INSERT INTO league_records (user_id, league_id, challenges_completed, challenge_total, notes)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(user_id, league_id) DO UPDATE SET
       challenges_completed = excluded.challenges_completed,
       challenge_total      = excluded.challenge_total`,
  );

  db.transaction(() => {
    for (const entry of file.leagues) {
      if (entry.status === "skipped_ruthless") {
        result.ruthless += 1;
        continue;
      }
      if (entry.status === "not_participated" || entry.completed === 0) {
        result.notParticipated += 1;
        continue;
      }
      const slug = SITE_LEAGUES[entry.league];
      const league = slug ? leagues.find((l) => l.game === "poe1" && l.slug === slug) : undefined;
      if (!league) {
        result.unmapped.push({ league: entry.league, completed: entry.completed, total: entry.total });
        continue;
      }
      clear.run(userId, league.id);
      for (const challenge of entry.challenges) {
        insert.run(
          userId,
          league.id,
          challenge.position,
          challenge.name,
          challenge.progress,
          challenge.completed ? 1 : 0,
          challenge.description,
          JSON.stringify(challenge.subtasks),
        );
      }
      const override = entry.total === league.challengeTotal ? null : entry.total;
      if (override !== null) result.totalsDiffer.push({ league: leagueTitle(league), site: entry.total, catalogue: league.challengeTotal });
      record.run(userId, league.id, entry.completed, override);
      result.imported.push({ league: leagueTitle(league), completed: entry.completed, total: entry.total });
    }
  })();
  return result;
}

/** A player's challenges in one league, in the site's order. */
export function listChallenges(userId: number, leagueId: number): Challenge[] {
  const rows = db
    .prepare(
      `SELECT position, name, progress, completed, description, subtasks
       FROM challenges WHERE user_id = ? AND league_id = ? ORDER BY position`,
    )
    .all(userId, leagueId) as {
    position: number;
    name: string;
    progress: string | null;
    completed: number;
    description: string | null;
    subtasks: string;
  }[];
  return rows.map((row) => ({
    position: row.position,
    name: row.name,
    progress: row.progress,
    completed: row.completed === 1,
    description: row.description,
    subtasks: parseSubtasks(row.subtasks),
  }));
}

function parseSubtasks(stored: string): ChallengeSubtask[] {
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((s) => isRecord(s) && typeof s.text === "string").map((s) => ({ text: s.text as string, completed: Boolean(s.completed) }))
      : [];
  } catch {
    return [];
  }
}

/** "4/6" as a fraction of the bar, or all or nothing where the site shows no count. */
export function challengeRatio(challenge: Pick<Challenge, "progress" | "completed">): number {
  const match = challenge.progress?.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (match && Number(match[2]) > 0) return Math.min(1, Number(match[1]) / Number(match[2]));
  return challenge.completed ? 1 : 0;
}
