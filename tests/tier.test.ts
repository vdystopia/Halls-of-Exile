import assert from "node:assert/strict";
import test from "node:test";
import { emptyBuild } from "../src/lib/games/poe1/pob";
import { characterTier, type TierInput } from "../src/lib/tier";

const complete = (overrides: Partial<TierInput> = {}): TierInput => ({
  playedMinutes: 600,
  notes: "full campaign 3:13:03",
  mainSkill: "golemancer",
  skillGem: null,
  pobCode: null,
  hasExport: true,
  data: { ...emptyBuild(), source: "poe-api" },
  leagueSlug: "3.25",
  ...overrides,
});

/**
 * The initial population is two halves, the record and the game's export, and
 * a character is finished when it has both. A code on top is the best it gets.
 */
test("a character with the record filled and the game's export is tier 2; a code makes it tier 1", () => {
  assert.deepEqual(characterTier(complete()), { tier: 2, missing: [] });
  assert.deepEqual(
    characterTier(complete({ pobCode: "abc", data: { ...emptyBuild(), source: "pob" } })),
    { tier: 1, missing: [] },
  );
  // A code alone, the way ongoing characters arrive, is tier 1 without an export.
  assert.deepEqual(
    characterTier(complete({ pobCode: "abc", hasExport: false, data: { ...emptyBuild(), source: "pob" } })),
    { tier: 1, missing: [] },
  );
});

test("each record field a person has to supply keeps a character at tier 3, and is named", () => {
  assert.deepEqual(characterTier(complete({ playedMinutes: null })), { tier: 3, missing: ["/played"] });
  assert.deepEqual(characterTier(complete({ playedMinutes: 0 })), { tier: 3, missing: ["/played"] });
  assert.deepEqual(characterTier(complete({ notes: "  " })), { tier: 3, missing: ["notes"] });
  assert.deepEqual(characterTier(complete({ mainSkill: null })), { tier: 3, missing: ["main skill"] });
  assert.deepEqual(characterTier(complete({ mainSkill: "Unknown" })), { tier: 3, missing: ["main skill"] }, "the record's placeholder is no answer");
  // The gem alone answers for the skill.
  assert.deepEqual(characterTier(complete({ mainSkill: null, skillGem: "Soulrend" })), { tier: 2, missing: [] });
  assert.deepEqual(characterTier(complete({ leagueSlug: "unspecified" })), { tier: 3, missing: ["league"] });
  assert.deepEqual(characterTier(complete({ playedMinutes: null, notes: null, mainSkill: null, leagueSlug: "unspecified" })), {
    tier: 3,
    missing: ["/played", "notes", "main skill", "league"],
  });
});

test("a hand-written character with nothing imported is tier 3 however complete its record", () => {
  assert.deepEqual(characterTier(complete({ hasExport: false, data: { ...emptyBuild(), source: "manual" } })), {
    tier: 3,
    missing: ["gear from the game"],
  });
  // A stale code with a manual build underneath is not a build code.
  assert.deepEqual(characterTier(complete({ pobCode: "abc", hasExport: false, data: { ...emptyBuild(), source: "manual" } })), {
    tier: 3,
    missing: ["gear from the game"],
  });
});

/** The site export has no tree and no skill gems; that is never held against a Path of Exile 2 character. */
test("a Path of Exile 2 character imported from the site is tier 2 without a tree", () => {
  assert.deepEqual(characterTier(complete({ data: { ...emptyBuild(), source: "poe2-site", trees: [] }, leagueSlug: "0.5" })), {
    tier: 2,
    missing: [],
  });
});
