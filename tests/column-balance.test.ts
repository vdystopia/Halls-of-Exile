import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { shorterSide, skillColumnHeight, statColumnHeight } from "../src/lib/column-balance";
import { parseCodeFor } from "../src/lib/games/builds";
import { gearFor } from "../src/lib/games/gear";
import type { GameId } from "../src/lib/games/types";

function side(game: GameId, fixture: string) {
  const build = parseCodeFor(game, fs.readFileSync(`tests/fixtures/${fixture}`, "utf8").trim());
  const gear = gearFor(game);
  const stats = build.stats ?? {};
  return shorterSide(
    statColumnHeight(stats, gear.defencePanels) + statColumnHeight(stats, gear.offencePanels),
    skillColumnHeight(build.skillGroups),
  );
}

test("a long Path of Exile 2 skill list puts resistances and attributes under the stats", () => {
  assert.equal(side("poe2", "poe2-pob-thevpleaser.txt"), "left");
});

test("a short Path of Exile 1 skill list takes them under the skills", () => {
  assert.equal(side("poe1", "pob-3.28-alternate.txt"), "right");
});

test("no stats and no skills ties to the left", () => {
  assert.equal(shorterSide(statColumnHeight({}, gearFor("poe1").defencePanels), skillColumnHeight([])), "left");
});
