import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";

/**
 * Path of Exile 2's drawn tree. It is generated from Path of Building 2's tree
 * data because that is versioned like its codes; pathofexile2.com's own copy
 * (kept by `tree:poe2:snapshot`) carries the positions the game draws, and is
 * the check. Both files are committed, so this needs no network.
 */
const SVG = fs.readFileSync(path.join(process.cwd(), "public", "trees", "poe2", "0.5.svg"), "utf8");
const CODE = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "poe2-pob-thevpleaser.txt"), "utf8").trim();

function circles(): Map<string, { x: number; y: number; classes: string }> {
  const found = new Map<string, { x: number; y: number; classes: string }>();
  for (const match of SVG.matchAll(/<circle id="n(\d+)" cx="(-?\d+)" cy="(-?\d+)"([^>]*)\/>/g)) {
    const classes = /class="([^"]*)"/.exec(match[4])?.[1] ?? "";
    found.set(match[1], { x: Number(match[2]), y: Number(match[3]), classes });
  }
  return found;
}

test("every passive on the main tree sits where the game draws it", () => {
  const snapshots = fs.readdirSync(path.join(process.cwd(), "scripts", "data", "poe2-trees")).sort();
  const site = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(path.join(process.cwd(), "scripts", "data", "poe2-trees", snapshots[0]))).toString("utf8"),
  ).context.data.nodes as Record<string, { x?: number; y?: number }>;

  let compared = 0;
  let worst = 0;
  for (const [id, at] of circles()) {
    if (at.classes.includes("ascendancy")) continue; // moved into the centre on purpose
    const truth = site[id];
    if (truth?.x === undefined || truth.y === undefined) continue;
    compared += 1;
    worst = Math.max(worst, Math.hypot(at.x - truth.x, at.y - truth.y));
  }
  assert.ok(compared > 4000, `compared ${compared} passives`);
  // Rounding and the site's own rounding: the largest seen is 7 units, against
  // passives 84 or more across.
  assert.ok(worst <= 8, `worst passive is ${worst.toFixed(1)} units from the game's position`);
});

test("every passive in the fixture build is on the drawn tree", async () => {
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const [tree] = parsePob2(CODE).trees;
  const drawn = circles();
  const missing = (tree.nodes ?? []).filter((id) => !drawn.has(String(id)));
  assert.deepEqual(missing, []);
});

test("ascendancies are drawn in the centre, one class token each", () => {
  const deadeye = [...circles().values()].filter((node) => node.classes.includes("asc-Deadeye"));
  assert.ok(deadeye.length > 10);
  for (const node of deadeye) assert.ok(Math.hypot(node.x, node.y) < 1300, "inside the class-start ring");
  // "Acolyte of Chayula" must be one class, or the reveal selector misses it.
  assert.match(SVG, /asc-Acolyte_of_Chayula/);
  assert.doesNotMatch(SVG, /asc-Acolyte of/);
});

test("each game only ever falls back to its own tree", async () => {
  const { treeAsset: poe2 } = await import("../src/lib/games/poe2/tree");
  const { treeAsset: poe1 } = await import("../src/lib/games/poe1/tree");
  assert.deepEqual(poe2("0.5"), { src: "/trees/poe2/0.5.svg", version: "0.5", exact: true });
  assert.equal(poe2("0.1")?.exact, false);
  assert.match(poe2("0.1")?.src ?? "", /^\/trees\/poe2\//);
  assert.doesNotMatch(poe1("0.5")?.src ?? "", /poe2/);
});

/** Deadeye's Projectile Proximity Specialisation is a choice; the build took Point Blank. */
test("a 'choose one' passive is named by the option the build took", async () => {
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const { gearFor } = await import("../src/lib/games/gear");
  const [tree] = parsePob2(CODE).trees;
  const choices = gearFor("poe2").choices(tree.nodes, "0.5");
  assert.equal(choices?.["42416"]?.name, "Point Blank");
  assert.match(choices?.["42416"]?.stats[0] ?? "", /more Hit damage/);
  assert.equal(gearFor("poe1").choices(tree.nodes, "3.29"), undefined);
  // The options themselves are in the document, hidden, so they count as placed.
  assert.match(SVG, /<circle id="n41875"[^>]*class="[^"]*option/);
});

/**
 * A build saved on an older tree is drawn on that tree, not the newest: a level
 * 94 Shaman whose Path of Building 2 save names tree 0.4.
 */
test("a 0.4 build is drawn on the 0.4 tree, every passive placed", async () => {
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const { treeAsset } = await import("../src/lib/games/poe2/tree");
  const code = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "poe2-pob-shaman-0.4.txt"), "utf8").trim();
  const build = parsePob2(code);
  const [tree] = build.trees;
  assert.equal(build.ascendClassName, "Shaman");
  assert.equal(tree.treeVersion, "0.4");
  assert.deepEqual(treeAsset(tree.treeVersion), { src: "/trees/poe2/0.4.svg", version: "0.4", exact: true });
  const svg = fs.readFileSync(path.join(process.cwd(), "public", "trees", "poe2", "0.4.svg"), "utf8");
  const drawn = new Set([...svg.matchAll(/<circle id="n(\d+)"/g)].map((match) => Number(match[1])));
  assert.deepEqual((tree.nodes ?? []).filter((id) => !drawn.has(id)), []);
  assert.match(svg, /asc-Shaman/);
});

/** A level 89 Warbringer saved on tree 0.3, with passives on both weapon sets. */
test("a 0.3 build is drawn on the 0.3 tree, weapon sets included", async () => {
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const { treeAsset } = await import("../src/lib/games/poe2/tree");
  const code = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "poe2-pob-0.3.txt"), "utf8").trim();
  const build = parsePob2(code);
  const [tree] = build.trees;
  assert.equal(build.ascendClassName, "Warbringer");
  assert.equal(tree.treeVersion, "0.3");
  assert.deepEqual(treeAsset(tree.treeVersion), { src: "/trees/poe2/0.3.svg", version: "0.3", exact: true });
  assert.ok((tree.weaponSets?.[1].length ?? 0) > 0 && (tree.weaponSets?.[2].length ?? 0) > 0);
  const svg = fs.readFileSync(path.join(process.cwd(), "public", "trees", "poe2", "0.3.svg"), "utf8");
  const drawn = new Set([...svg.matchAll(/<circle id="n(\d+)"/g)].map((match) => Number(match[1])));
  assert.deepEqual((tree.nodes ?? []).filter((id) => !drawn.has(id)), []);
  assert.match(svg, /asc-Warbringer/);
});

/** A level 92 Smith of Kitava saved on tree 0.2. */
test("a 0.2 build is drawn on the 0.2 tree, every passive placed", async () => {
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const { treeAsset } = await import("../src/lib/games/poe2/tree");
  const code = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "poe2-pob-0.2.txt"), "utf8").trim();
  const build = parsePob2(code);
  const [tree] = build.trees;
  assert.equal(build.ascendClassName, "Smith of Kitava");
  assert.equal(tree.treeVersion, "0.2");
  assert.deepEqual(treeAsset(tree.treeVersion), { src: "/trees/poe2/0.2.svg", version: "0.2", exact: true });
  const svg = fs.readFileSync(path.join(process.cwd(), "public", "trees", "poe2", "0.2.svg"), "utf8");
  const drawn = new Set([...svg.matchAll(/<circle id="n(\d+)"/g)].map((match) => Number(match[1])));
  assert.deepEqual((tree.nodes ?? []).filter((id) => !drawn.has(id)), []);
  assert.match(svg, /asc-Smith_of_Kitava/);
});
