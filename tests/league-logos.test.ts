import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { leagueLogo } from "../src/lib/league-logos";
import { LEAGUE_SEED } from "../src/lib/leagues";

/**
 * The logo closes the character page header, so a league without one leaves a
 * hole at the top of every character page filed under it. Every catalogue row
 * has to resolve to a committed file — `npm run leagues:art` after adding one.
 */
test("every league in the catalogue has a logo on disk", () => {
  for (const league of LEAGUE_SEED) {
    const logo = leagueLogo(league);
    assert.ok(logo, `no logo for ${league.game}/${league.slug} — run npm run leagues:art`);
    assert.ok(logo.width > 0 && logo.height > 0);
    const file = path.join(process.cwd(), "public", logo.src.replace(/^\//, ""));
    assert.ok(fs.existsSync(file), `${logo.src} is indexed but not on disk`);
  }
});

/** Slugs repeat across the games, so the lookup is by game and slug together. */
test("a league's logo is looked up by game as well as slug", () => {
  const first = leagueLogo({ game: "poe1", slug: "3.29" });
  assert.ok(first && !first.generic, "3.29 has its own logo");
  assert.equal(leagueLogo({ game: "poe2", slug: "3.29" }), null);
});

/**
 * A stand-in is the game's own logo, marked as such, so nobody mistakes it for
 * the league's art. Each game's stand-in is its own game's logo.
 */
test("a stand-in logo is marked generic and belongs to the right game", () => {
  const poe1 = leagueLogo({ game: "poe1", slug: "unspecified" });
  const poe2 = leagueLogo({ game: "poe2", slug: "beta-1" });
  assert.ok(poe1?.generic && poe2?.generic);
  assert.notEqual(poe1.src, poe2.src);
});
