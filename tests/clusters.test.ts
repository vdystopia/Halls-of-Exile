import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { clusterBase, clusterLayout, drawnAllocation, layoutFromGraphs, layoutFromJewels, readClusterJewel } from "../src/lib/games/poe1/clusters";
import { parseItem } from "../src/lib/games/poe1/items";
import { chosenMasteries } from "../src/lib/games/poe1/masteries";
import { buildFromPoeExport, readPoeExport } from "../src/lib/games/poe1/poe-api";
import { parsePob } from "../src/lib/games/poe1/pob";
import { TREE_DATA } from "../src/lib/games/poe1/tree-data";
import { orbitAngle } from "../src/lib/games/poe1/tree-geometry";

const tree = TREE_DATA["3.29"];
const fixture = (name: string) => fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", name), "utf8");
const encode = (xml: string) =>
  zlib.deflateSync(Buffer.from(xml, "utf8")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
const modText = (mod: unknown) => (typeof mod === "string" ? mod : ((mod as { description?: string })?.description ?? ""));

/**
 * The strongest check there is on the Path of Building port: the game's own
 * endpoint lays out every socketed cluster, and the port lays out the same
 * jewels from their item text, and the two must agree passive for passive —
 * kind, name and position. The fixture's five characters were each chosen for a
 * case: three levels of nesting, a two-line enchant, a medium cluster in a large
 * socket, small passives that grant nothing, and a ten-cluster build.
 */
test("the Path of Building port lays clusters out exactly as the game does", () => {
  const exported = readPoeExport(fixture("cluster-export.json"));
  assert.equal(exported.characters.length, 5);
  for (const character of exported.characters) {
    const build = buildFromPoeExport(character, exported);
    const spec = build.trees[0];
    assert.ok(spec.clusterGraphs?.length, `${character.name} carries no cluster layout`);
    const game = layoutFromGraphs(spec.clusterGraphs ?? [], new Set(spec.extendedNodes), tree);

    const jewels = new Map();
    const items = (character.raw?.raw?.passives?.items ?? []) as {
      x: number;
      baseType: string;
      enchantMods?: unknown[];
      implicitMods?: unknown[];
      explicitMods?: unknown[];
    }[];
    for (const item of items) {
      const lines = [...(item.enchantMods ?? []), ...(item.implicitMods ?? []), ...(item.explicitMods ?? [])].map(modText);
      const jewel = readClusterJewel(item.baseType, lines);
      if (jewel) jewels.set(tree.jewelSlots[item.x], jewel);
    }
    const everySocket = new Set(Object.keys(tree.sockets).map(Number));
    const port = layoutFromJewels(everySocket, jewels, tree);

    const at = (layout: typeof game) =>
      new Map(layout.nodes.map((node) => [`${node.x},${node.y}`, `${node.kind} ${node.name}`]));
    assert.deepEqual(at(port), at(game), `${character.name}: the port and the game disagree`);
  }
});

/** Every cluster passive the game says is allocated is drawn and lit. */
test("an export's allocated cluster passives are all lit", () => {
  const exported = readPoeExport(fixture("cluster-export.json"));
  for (const character of exported.characters) {
    const spec = buildFromPoeExport(character, exported).trees[0];
    const layout = clusterLayout(spec, tree);
    assert.ok(layout);
    assert.equal(
      layout.nodes.filter((node) => node.allocated).length,
      spec.extendedNodes?.length,
      `${character.name}: allocated cluster passives and lit cluster nodes differ`,
    );
  }
});

/**
 * A nested cluster hangs from a socket inside its parent cluster. The game draws
 * that socket as a local node and links the nested cluster to the *real* tree
 * socket, so the two have to be unified or the link runs to nowhere.
 */
test("every cluster link ends on a drawn node or a real tree socket", () => {
  const exported = readPoeExport(fixture("cluster-export.json"));
  for (const character of exported.characters) {
    const layout = clusterLayout(buildFromPoeExport(character, exported).trees[0], tree);
    assert.ok(layout);
    const drawn = new Set(layout.nodes.map((node) => node.id));
    for (const edge of layout.edges) {
      for (const end of [edge.a, edge.b]) {
        assert.ok(drawn.has(end) || tree.sockets[String(end)], `${character.name}: ${edge.id} runs to nothing`);
      }
    }
  }
});

/**
 * Path of Building stores a cluster's allocation as ids it invents, packing
 * socket indices, cluster size and template slot into the bits. The port has to
 * reproduce every one, or the tree lights nothing. The fixture is a real save
 * with keystone clusters, 17 and 23 allocated cluster passives, and sockets that
 * share one item — which Path of Building allows.
 */
test("every cluster id a Path of Building save stores is regenerated", () => {
  const build = parsePob(encode(fixture("pob-clusters.xml")));
  const expected = [2, 17, 23];
  build.trees.forEach((spec, index) => {
    const ids = (spec.nodes ?? []).filter((id) => id > 0xffff);
    assert.equal(ids.length, expected[index], `spec ${index + 1} fixture has changed`);
    const layout = clusterLayout(spec, tree);
    assert.ok(layout, `spec ${index + 1} laid out nothing`);
    const drawn = new Set(layout.nodes.map((node) => node.id));
    assert.deepEqual(ids.filter((id) => !drawn.has(id)), [], `spec ${index + 1}: stored ids with no node`);
  });
});

/**
 * A save from before Path of Building's cluster hash change refers to a nested
 * socket by its old id. Path of Building converts it, but in a single pass that
 * moves the jewel only after the nested cluster would have been built — so its
 * own load drops the Lone Messenger this save records as allocated. The archive
 * keeps it: the conversion is run to a fixed point.
 */
test("an old save keeps the cluster nested inside a converted socket", () => {
  const build = parsePob(encode(fixture("pob-clusters-legacy.xml")));
  const spec = build.trees[0];
  assert.equal(spec.clusterHashFormat, 1, "a spec with no format attribute is the old format");
  const layout = clusterLayout(spec, tree);
  assert.ok(layout);
  const keystone = layout.nodes.find((node) => node.kind === "Keystone");
  assert.ok(keystone, "the nested keystone cluster was not built");
  assert.equal(keystone.name, "Lone Messenger");
  assert.equal(keystone.allocated, true, "the nested keystone lost its allocation");
  // Everything the save stores is placed.
  const drawn = new Set(layout.nodes.map((node) => node.id));
  const ids = (spec.nodes ?? []).filter((id) => id > 0xffff);
  assert.deepEqual(ids.filter((id) => !drawn.has(id)), []);
});

/**
 * On an old save the stored list can name a cluster passive by an id that now
 * belongs to a *different* passive. The layout is authoritative inside clusters,
 * so the page lights what the layout says rather than what the list says.
 */
test("the page lights the layout's cluster allocation, not the stored ids", () => {
  const spec = parsePob(encode(fixture("pob-clusters-legacy.xml"))).trees[0];
  const layout = clusterLayout(spec, tree);
  const lit = new Set(drawnAllocation(spec, layout, tree));
  for (const node of layout?.nodes ?? []) {
    assert.equal(lit.has(node.id), node.allocated, `${node.name} (${node.id}) lit wrongly`);
  }
  // The old socket id the save used is not lit — its jewel moved.
  const nested = Object.entries(tree.sockets).filter(([, socket]) => socket.parent !== undefined).map(([id]) => Number(id));
  const stale = (spec.nodes ?? []).filter((id) => nested.includes(id) && !layout?.nodes.some((node) => node.id === id));
  for (const id of stale) assert.equal(lit.has(id), false, `stale socket ${id} is lit`);
});

test("a rare cluster jewel is read from Path of Building's item text", () => {
  const jewel = readClusterJewel("Large Cluster Jewel", [
    "Cluster Jewel Skill: affliction_minion_damage",
    "Cluster Jewel Node Count: 8",
    "{crafted}Adds 8 Passive Skills",
    "{crafted}2 Added Passive Skills are Jewel Sockets",
    "{crafted}Added Small Passive Skills grant: Minions deal 10% increased Damage",
    "1 Added Passive Skill is Primordial Bond",
    "1 Added Passive Skill is Renewal",
  ]);
  assert.ok(jewel);
  assert.equal(jewel.skill, "affliction_minion_damage");
  assert.equal(jewel.nodeCount, 8);
  assert.equal(jewel.socketCount, 2);
  assert.deepEqual(jewel.notables, ["Primordial Bond", "Renewal"]);
  assert.equal(jewel.valid, true);
});

/** A magic item is one line — the base is found inside the name. */
test("a magic cluster jewel's base is found inside its name", () => {
  assert.equal(clusterBase("Notable Medium Cluster Jewel"), "Medium Cluster Jewel");
  assert.equal(clusterBase("Large Cluster Jewel of the Pack"), "Large Cluster Jewel");
  assert.equal(clusterBase("Viridian Jewel"), undefined);
  assert.ok(readClusterJewel("Notable Medium Cluster Jewel", ["Adds 4 Passive Skills", "Added Small Passive Skills grant: 12% increased Trap Damage", "Added Small Passive Skills grant: 12% increased Mine Damage"])?.valid);
});

/**
 * Six enchants are two lines. The game sends them as one mod with a newline
 * inside, Path of Building as two lines; both have to resolve to the skill.
 */
test("a two-line enchant resolves however it is split", () => {
  const game = readClusterJewel("Medium Cluster Jewel", [
    "Adds 5 Passive Skills",
    "Added Small Passive Skills grant: 12% increased Trap Damage\nAdded Small Passive Skills grant: 12% increased Mine Damage",
  ]);
  const pob = readClusterJewel("Medium Cluster Jewel", [
    "Adds 5 Passive Skills",
    "Added Small Passive Skills grant: 12% increased Trap Damage",
    "Added Small Passive Skills grant: 12% increased Mine Damage",
  ]);
  assert.equal(game?.skill, "affliction_trap_and_mine_damage");
  assert.equal(pob?.skill, "affliction_trap_and_mine_damage");
});

test("a keystone cluster and a jewel with nothing to lay out", () => {
  const keystone = readClusterJewel("Small Cluster Jewel", ["Adds Lone Messenger"]);
  assert.equal(keystone?.keystone, "Lone Messenger");
  assert.equal(keystone?.valid, true);
  // No skill and no node count: Path of Building would not build it, nor does this.
  assert.equal(readClusterJewel("Large Cluster Jewel", ["1 Added Passive Skill is Renewal"])?.valid, false);
});

/**
 * Path of Building writes "Cluster Jewel Node Count" beside the skill line on
 * every cluster it saves. Left unrecognised it counted as the first implicit and
 * pushed the real third implicit — what the small passives grant — into the
 * explicits.
 */
test("a cluster jewel's header lines are not implicits", () => {
  const item = parseItem(
    [
      "Rarity: RARE",
      "New Item",
      "Large Cluster Jewel",
      "Cluster Jewel Skill: affliction_minion_damage",
      "Cluster Jewel Node Count: 8",
      "Implicits: 3",
      "{crafted}Adds 8 Passive Skills",
      "{crafted}2 Added Passive Skills are Jewel Sockets",
      "{crafted}Added Small Passive Skills grant: Minions deal 10% increased Damage",
      "1 Added Passive Skill is Renewal",
    ].join("\n"),
    1,
  );
  assert.equal(item.implicits.length, 3);
  assert.ok(item.implicits[2].startsWith("Added Small Passive Skills grant"));
  assert.deepEqual(item.explicits, ["1 Added Passive Skill is Renewal"]);
});

/**
 * Orbits of 16 and 40 passives are not evenly spaced: since 3.17 the game puts
 * them at every 30 and 45 degrees, and every 10 and 45. Spacing them evenly put
 * a thousand nodes of the 3.29 tree up to 44.7 units from where the game draws
 * them. These four were among the worst; the reference coordinates are pobb.in's,
 * generated independently of this archive.
 */
test("16- and 40-slot orbits use the game's uneven spacing", () => {
  assert.equal(Math.round((orbitAngle(1, 16) * 180) / Math.PI), 30);
  assert.equal(Math.round((orbitAngle(2, 16) * 180) / Math.PI), 45);
  assert.equal(Math.round((orbitAngle(5, 40) * 180) / Math.PI), 45);
  assert.equal(Math.round((orbitAngle(1, 6) * 180) / Math.PI), 60, "other orbits stay even");

  const svg = fs.readFileSync(path.join(process.cwd(), "public", "trees", "3.29.svg"), "utf8");
  const reference: [number, number, number][] = [
    [1698, 8123, 3794],
    [7399, -6485, 302],
    [9055, 8087, -4391],
    [10992, 5775, -6993],
  ];
  for (const [id, x, y] of reference) {
    const match = new RegExp(`<circle id="n${id}" cx="(-?\\d+)" cy="(-?\\d+)"`).exec(svg);
    assert.ok(match, `node ${id} is not drawn`);
    const off = Math.hypot(Number(match[1]) - x, Number(match[2]) - y);
    assert.ok(off < 3, `node ${id} is ${off.toFixed(1)} units from the game's position`);
  }
});

test("the tree data carries a proxy group for every expansion socket", () => {
  for (const [id, socket] of Object.entries(tree.sockets)) {
    assert.ok(tree.proxyGroups[String(socket.proxy)], `socket ${id} has no proxy group`);
  }
  assert.equal(Object.values(tree.sockets).filter((socket) => socket.size === 2).length, 6, "six large sockets");
  assert.ok(Object.keys(tree.clusterNodes).length > 250, "cluster notables are missing");
});

/**
 * A mastery offers several effects and the character chose one. The tooltip
 * shows that one, resolved from the tree data by the effect id the build
 * stores. The collector resolves the same choice independently from the game's
 * own response, so its text is the oracle: 37 masteries across the fixture.
 */
test("a game export's chosen masteries resolve to the text the game reports", () => {
  const exported = readPoeExport(fixture("cluster-export.json"));
  let checked = 0;
  for (const character of exported.characters) {
    const spec = buildFromPoeExport(character, exported).trees[0];
    const chosen = chosenMasteries(spec, tree);
    const reported = (character.raw?.passives?.masteries ?? []) as { effect_id: number; stats: string[] }[];
    const effects = spec.masteryEffects ?? {};
    for (const [node, effect] of Object.entries(effects)) {
      // A runegraft over the mastery. VronDmon chose "+30 to maximum Life" on
      // this Life Mastery and then applied Runegraft of Refraction over it, which
      // supersedes the choice. The collector reports what is in force — the
      // runegraft — so it is compared against the override, and the choice
      // underneath still resolves to the mastery's own option.
      const override = spec.overrides?.[node];
      if (override?.kind === "runegraft") {
        assert.deepEqual(override.stats, reported.find((mastery) => mastery.effect_id === effect)?.stats);
        assert.deepEqual(chosen[node], ["+30 to maximum Life"]);
        checked += 1;
        continue;
      }
      const expected = reported.find((mastery) => mastery.effect_id === effect)?.stats;
      assert.ok(expected, `${character.name}: the collector reports no effect ${effect}`);
      assert.deepEqual(chosen[node], expected, `${character.name}: mastery ${node} resolved differently`);
      checked += 1;
    }
  }
  assert.equal(checked, 37);
});

/** Path of Building stores the same choice as "{node,effect}" pairs. */
test("a Path of Building save's chosen masteries resolve, one effect each", () => {
  const build = parsePob(encode(fixture("pob-clusters.xml")));
  for (const spec of build.trees) {
    const effects = spec.masteryEffects ?? {};
    const chosen = chosenMasteries(spec, tree);
    assert.ok(Object.keys(effects).length > 0, `${spec.title} stored no mastery choices`);
    for (const node of Object.keys(effects)) {
      assert.ok(chosen[node]?.length, `${spec.title}: mastery ${node} has no text on the 3.29 tree`);
    }
  }
});

test("a mastery with no recorded choice gets no invented text", () => {
  assert.deepEqual(chosenMasteries({ nodeCount: 0, masteryCount: 0 }, tree), {});
  // An effect id this tree does not know is omitted, not guessed at.
  assert.deepEqual(chosenMasteries({ nodeCount: 0, masteryCount: 0, masteryEffects: { "1": 99999999 } }, tree), {});
});

/**
 * A runegraft is applied over an allocated mastery and replaces its effect; a
 * tattoo replaces an ordinary passive. The endpoint reports both in
 * `skill_overrides`, flagging a runegraft `isMastery`.
 */
test("a game export's runegrafts and tattoos are kept, each for what it is", () => {
  const exported = readPoeExport(fixture("cluster-export.json"));
  const vron = exported.characters.find((character) => character.name === "VronDmon");
  assert.ok(vron);
  const overrides = buildFromPoeExport(vron, exported).trees[0].overrides ?? {};
  assert.deepEqual(overrides["292"], {
    kind: "runegraft",
    name: "Runegraft of Refraction",
    stats: ["Fire at most 1 Projectile", "Projectiles Fork", "Projectiles Chain an additional time"],
  });
  const tattoos = Object.values(overrides).filter((override) => override.kind === "tattoo");
  assert.ok(tattoos.length > 0 && tattoos.every((tattoo) => tattoo.name.startsWith("Tattoo of")));

  const optimal = exported.characters.find((character) => character.name === "OptimalDystopia");
  assert.ok(optimal);
  const theirs = Object.values(buildFromPoeExport(optimal, exported).trees[0].overrides ?? {});
  assert.equal(theirs.length, 28);
  assert.ok(theirs.every((override) => override.kind === "tattoo"), "no runegraft on this character");
});

/**
 * Path of Building stores the same overrides as `<Override nodeId dn>` with the
 * lines as text. The fixture's three trees each carry three runegrafts, and the
 * nodes they sit on are masteries on the tree — which is what makes them
 * runegrafts rather than tattoos.
 */
test("a Path of Building save's runegrafts sit on masteries and keep their lines", () => {
  const build = parsePob(encode(fixture("pob-clusters.xml")));
  const svg = fs.readFileSync(path.join(process.cwd(), "public", "trees", "3.29.svg"), "utf8");
  for (const spec of build.trees) {
    const runegrafts = Object.entries(spec.overrides ?? {}).filter(([, override]) => override.kind === "runegraft");
    assert.deepEqual(
      runegrafts.map(([node]) => node).sort(),
      ["4139", "41415", "48505"],
      `${spec.title} runegrafts`,
    );
    for (const [node, override] of runegrafts) {
      assert.match(svg, new RegExp(`<circle id="n${node}"[^>]*class="mastery"`), `${node} is not a mastery`);
      assert.ok(override.stats.length > 0, `${override.name} has no lines`);
    }
    const fortress = spec.overrides?.["48505"];
    assert.deepEqual(fortress?.stats, ["10% reduced Attributes", "40% increased Global Defences", "Limited to 1 Runegraft of the Fortress"]);
    assert.ok(Object.values(spec.overrides ?? {}).some((override) => override.kind === "tattoo"), `${spec.title} has no tattoos`);
  }
});
