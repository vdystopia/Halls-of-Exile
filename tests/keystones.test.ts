import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { keystoneIcon } from "../src/lib/games/keystones";
import poe1 from "../src/lib/games/poe1/keystone-icons.json";
import poe2 from "../src/lib/games/poe2/keystone-icons.json";

/**
 * The allocated panel draws every keystone with its icon, and a missing one is
 * a hole in the panel — so every icon the index names is on disk, and the
 * keystones the fixtures allocate resolve.
 */
test("every keystone icon the index names is on disk, in both games", () => {
  for (const [game, index] of [
    ["poe1", poe1],
    ["poe2", poe2],
  ] as const) {
    const names = Object.keys(index.icons);
    assert.ok(names.length > 40, `${game} has only ${names.length} keystones`);
    for (const name of names) {
      const icon = keystoneIcon(game, name);
      assert.ok(icon, `no ${game} icon for ${name}`);
      assert.ok(fs.existsSync(path.join(process.cwd(), "public", icon.src.replace(/^\//, ""))), `${icon.src} missing`);
    }
  }
  for (const name of ["Ancestral Bond", "Resolute Technique", "Chaos Inoculation", "Eldritch Battery", "Mind Over Matter"]) {
    assert.ok(keystoneIcon("poe1", name), `no Path of Exile icon for ${name}`);
  }
});

/** The same name is a different keystone in each game, with its own art. */
test("a keystone both games have resolves to each game's own icon, and a name is never guessed", () => {
  const first = keystoneIcon("poe1", "Ancestral Bond");
  const second = keystoneIcon("poe2", "Ancestral Bond");
  assert.ok(first && second);
  assert.notEqual(first.src, second.src);
  assert.match(first.src, /^\/keystones\/poe1\//);
  assert.match(second.src, /^\/keystones\/poe2\//);
  assert.equal(keystoneIcon("poe1", "Enduring Bond"), null, "a notable is not a keystone");
  assert.equal(keystoneIcon("poe2", "Arrow Dancing"), null, "a Path of Exile keystone is not a Path of Exile 2 one");
  assert.equal(keystoneIcon("poe1", null), null);
});
