import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Pages and components never import a game's own folder. They go through the
 * dispatch modules in `src/lib/games/` (`gear.ts`, `builds.ts`, `skills.ts`…),
 * which pick the game, or `shared/` for shapes both games use. The character
 * page once ran Path of Exile 1's cluster, mastery and tree-data code on every
 * Path of Exile 2 build, and was harmless only because none of it matched.
 */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

test("no page or component imports a game's own folder", () => {
  const root = path.join(process.cwd(), "src");
  const offenders = [...sources(path.join(root, "app")), ...sources(path.join(root, "components"))].filter((file) =>
    /from\s+"@\/lib\/games\/poe\d\//.test(fs.readFileSync(file, "utf8")),
  );
  assert.deepEqual(offenders.map((file) => path.relative(root, file)), []);
});
