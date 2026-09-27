import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/** A scratch archive for this file, so nothing here touches ./data. */
process.env.ARCHIVE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "halls-challenges-")), "archive.db");

const FIXTURE = path.join(__dirname, "fixtures", "challenges.json");

test("the challenge file is read league by league, and what it cannot use is named", async () => {
  const { readChallengeFile } = await import("../src/lib/challenges");
  const file = readChallengeFile(fs.readFileSync(FIXTURE, "utf8"));
  assert.equal(file.account, "zxBlasphemy#5164");
  assert.deepEqual(
    file.leagues.map((l) => `${l.league}:${l.status}`),
    [
      "Mirage Ruthless:skipped_ruthless",
      "Ultimatum:played",
      "Heist:not_participated",
      "Synthesis:played",
      "Archnemesis:played",
      "Talisman:played",
      "Flashback:played",
    ],
  );
  const ultimatum = file.leagues.find((l) => l.league === "Ultimatum");
  assert.equal(ultimatum?.status, "played");
  if (ultimatum?.status !== "played") return;
  assert.deepEqual(
    ultimatum.challenges.map((c) => c.position),
    [1, 2, 3, 4, 33],
    "rows keep the site's positions, in order",
  );
  const trialmaster = ultimatum.challenges.find((c) => c.position === 33)!;
  assert.equal(trialmaster.description, null, "a row the site has no detail for stays empty rather than invented");
  assert.equal(trialmaster.subtasks.length, 0);
  // Archnemesis row 23 carries a blank sub-item on the site; it is dropped and said so.
  assert.match(file.problems.join("\n"), /Archnemesis.*sub-item with no text/);

  assert.deepEqual(readChallengeFile("not json").problems, ["The file is not JSON."]);
  assert.equal(readChallengeFile('{"account":"x","leagues":[{"league":"Ultimatum","status":"played","completed":1,"total":40,"challenges":[]}]}').leagues.length, 0);
});

test("applying the file stores each played league in the site's order, counts it as played, and replaces on re-upload", async () => {
  const { applyChallenges, listChallenges, readChallengeFile } = await import("../src/lib/challenges");
  const { db } = await import("../src/lib/db");
  const { getLeagueProgress, getUserTotals, listAllLeagues, listLeaguesForUser } = await import("../src/lib/queries");
  const leagues = listAllLeagues();
  const user = db.prepare(`INSERT INTO users (username) VALUES ('challenger')`).run().lastInsertRowid as number;
  const ultimatum = leagues.find((l) => l.game === "poe1" && l.slug === "3.14")!;
  const synthesis = leagues.find((l) => l.game === "poe1" && l.slug === "3.6")!;
  const talisman = leagues.find((l) => l.game === "poe1" && l.slug === "2.1")!;
  // A note the player wrote before the import must survive it.
  db.prepare(`INSERT INTO league_records (user_id, league_id, challenges_completed, challenge_total, notes) VALUES (?, ?, 2, NULL, 'kept')`).run(user, ultimatum.id);

  const file = readChallengeFile(fs.readFileSync(FIXTURE, "utf8"));
  const result = applyChallenges(user, file, leagues);
  assert.deepEqual(result.imported.map((e) => `${e.league} ${e.completed}/${e.total}`), [
    "3.14 Ultimatum 5/40",
    "3.6 Synthesis 3/40",
    "3.17 Archnemesis (Siege of the Atlas) 1/40",
    "2.1 Talisman 1/33",
  ]);
  assert.deepEqual(result.unmapped, [{ league: "Flashback", completed: 1, total: 20 }], "a label the map lacks is reported, never guessed");
  assert.equal(result.notParticipated, 1);
  assert.equal(result.ruthless, 1);
  assert.deepEqual(result.totalsDiffer, [{ league: "2.1 Talisman", site: 33, catalogue: 32 }]);

  const stored = listChallenges(user, ultimatum.id);
  assert.deepEqual(stored.map((c) => c.position), [1, 2, 3, 4, 33]);
  assert.equal(stored[0].name, "Mastering the Basics");
  assert.match(stored[0].progress ?? "", /^\d+\/\d+$/);
  assert.equal(stored[0].completed, true);
  assert.ok(stored[0].subtasks.length > 0, "sub-items come back as they went in");
  assert.equal(stored[4].description, null);

  const progress = getLeagueProgress(user, ultimatum.id)!;
  assert.equal(progress.challengesCompleted, 5, "the site's count is the record");
  assert.equal(progress.challengeTotal, null, "a total equal to the catalogue's is not an override");
  assert.equal(progress.notes, "kept", "the player's own note survives");
  assert.equal(getLeagueProgress(user, talisman.id)!.challengeTotal, 33, "a total the site disagrees on is stored for this player");

  // Played without a single character filed: Synthesis counts, everywhere leagues are counted.
  assert.equal(getUserTotals(user).leagues, 4);
  const synthesisRow = listLeaguesForUser(user).find((l) => l.id === synthesis.id)!;
  assert.equal(synthesisRow.characterCount, 0);
  assert.equal(synthesisRow.challengesCompleted, 3);

  // Uploading again replaces rather than doubles, and a changed count wins.
  const again = readChallengeFile(fs.readFileSync(FIXTURE, "utf8"));
  const changed = again.leagues.find((l) => l.league === "Ultimatum");
  if (changed?.status === "played") {
    changed.completed = 3;
    changed.challenges = changed.challenges.slice(0, 3);
  }
  applyChallenges(user, again, leagues);
  assert.deepEqual(listChallenges(user, ultimatum.id).map((c) => c.position), [1, 2, 3]);
  assert.equal(getLeagueProgress(user, ultimatum.id)!.challengesCompleted, 3);
  const rows = db.prepare(`SELECT COUNT(*) AS c FROM challenges WHERE user_id = ? AND league_id = ?`).get(user, ultimatum.id) as { c: number };
  assert.equal(rows.c, 3, "nothing from the first upload is left behind");
});

test("a challenge's bar is its own count, or all or nothing where the site shows none", async () => {
  const { challengeRatio } = await import("../src/lib/challenges");
  assert.equal(challengeRatio({ progress: "4/6", completed: false }), 4 / 6);
  assert.equal(challengeRatio({ progress: "6/6", completed: true }), 1);
  assert.equal(challengeRatio({ progress: null, completed: true }), 1);
  assert.equal(challengeRatio({ progress: null, completed: false }), 0);
});
