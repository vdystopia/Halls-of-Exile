import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { generatedTreeVersions, treeAsset } from "../src/lib/games/poe1/tree";

const versions = generatedTreeVersions();

test("every version the index claims is actually on disk", () => {
  for (const version of versions) {
    const file = path.join(process.cwd(), "public", "trees", `${version}.svg`);
    assert.ok(fs.existsSync(file), `${version} is indexed but ${file} is missing`);
  }
});

/**
 * The index is what the server points an <object> at. A version listed there
 * with no file behind it is a 404 inside an element the page has already
 * committed to drawing, which shows as an empty panel and no error.
 */
test("a build is drawn on its own tree version where one exists", () => {
  const asset = treeAsset(versions[0]);
  assert.ok(asset);
  assert.equal(asset.version, versions[0]);
  assert.equal(asset.exact, true);
  assert.equal(asset.src, `/trees/${versions[0]}.svg`);
});

/**
 * Node ids are stable between versions but their positions are not, so drawing
 * an old build on a current tree misplaces a good share of it. That is allowed
 * — generating the missing version is one command — but it is never silent.
 */
test("a version that has not been generated falls back and says so", () => {
  const asset = treeAsset("3.11");
  assert.ok(asset);
  assert.equal(asset.exact, false, "a fallback must not claim to be the right tree");
  assert.ok(versions.includes(asset.version));
});

/** An export from the game's own endpoints reports today's allocation. */
test("a build with no recorded version is drawn on the newest tree, exactly", () => {
  for (const missing of [undefined, null, ""]) {
    const asset = treeAsset(missing);
    assert.ok(asset);
    assert.equal(asset.exact, true, "the live tree is the right tree for a live reading");
  }
});

test("the newest tree is picked by version order, not by string order", () => {
  // "3.9" sorts above "3.29" as a string; the resolver must not fall for it.
  const asset = treeAsset("0.0-nonexistent");
  assert.ok(asset);
  const numericNewest = [...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
  assert.equal(asset.version, numericNewest);
});

/**
 * The page lights a node with `#n<id>` and a connection with `#c<a>-<b>`, both
 * derived from ids alone, so the shapes of those ids are load-bearing.
 */
test("the generated tree names its nodes and connections the way the page expects", () => {
  const svg = fs.readFileSync(path.join(process.cwd(), "public", "trees", `${versions[0]}.svg`), "utf8");
  const nodeIds = [...svg.matchAll(/<circle id="([^"]+)"/g)].map((match) => match[1]);
  const edgeIds = [...svg.matchAll(/<(?:line|path) [^>]*id="([^"]+)"/g)].map((match) => match[1]);

  assert.ok(nodeIds.length > 2000, `only ${nodeIds.length} nodes — is the tree complete?`);
  assert.ok(edgeIds.length > 2000, `only ${edgeIds.length} connections`);
  for (const id of nodeIds) assert.match(id, /^n\d+$/);
  for (const id of edgeIds) assert.match(id, /^c\d+-\d+$/);

  // Both ends of every connection have to exist, or it can never light up.
  const known = new Set(nodeIds);
  const dangling = edgeIds.filter((id) => {
    const [a, b] = id.slice(1).split("-");
    return !known.has(`n${a}`) || !known.has(`n${b}`);
  });
  assert.deepEqual(dangling, [], "a connection points at a node that is not drawn");
});

test("no node is drawn twice, which would double the ids the page selects on", () => {
  const svg = fs.readFileSync(path.join(process.cwd(), "public", "trees", `${versions[0]}.svg`), "utf8");
  const ids = [...svg.matchAll(/<circle id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

/**
 * Every ascendancy is stacked at one spot and revealed by class, so the page's
 * `.asc-<Name>` rule has to match something for a name a character can carry.
 */
test("each ascendancy is a class the page can reveal", () => {
  const svg = fs.readFileSync(path.join(process.cwd(), "public", "trees", `${versions[0]}.svg`), "utf8");
  for (const name of ["Elementalist", "Juggernaut", "Ascendant", "Warden"]) {
    assert.ok(svg.includes(`asc-${name}`), `no nodes carry asc-${name}`);
  }
  // Hidden by default: without this every ascendancy overlaps into a blot.
  assert.match(svg, /\.ascendancy\{display:none\}/);
});

/**
 * Where two nodes sit on the same orbit of the same group, the connection
 * between them is an arc of that orbit, and the sweep flag decides which side
 * of the chord it bulges. With the large-arc flag off both values give an arc
 * of the same length, so a wrong one is not longer — it curves the opposite
 * way, bowing inward across the group instead of following the ring. Half of
 * them did exactly that, because the angles deciding the sweep were measured
 * about the SVG origin rather than about the orbit's own centre.
 *
 * Nothing in the file says where an orbit's centre is, so the invariant used
 * here is derived from the arcs themselves: two arcs of equal radius that share
 * a node are on the same ring, so the centre implied by each must be the same
 * point. A flipped sweep puts one of them on the far side of the chord and the
 * two centres come apart by twice the ring's height.
 */
test("every arc curves the same way round its own ring", () => {
  const svg = fs.readFileSync(path.join(process.cwd(), "public", "trees", `${versions[0]}.svg`), "utf8");
  const arcs = [...svg.matchAll(/<path d="M (-?\d+) (-?\d+) A (\d+) \d+ 0 0 (\d) (-?\d+) (-?\d+)" id="c(\d+)-(\d+)"/g)].map(
    (match) => ({
      x1: Number(match[1]),
      y1: Number(match[2]),
      r: Number(match[3]),
      sweep: Number(match[4]),
      x2: Number(match[5]),
      y2: Number(match[6]),
      a: match[7],
      b: match[8],
    }),
  );
  assert.ok(arcs.length > 1000, `only ${arcs.length} arcs — is the tree complete?`);

  /** The centre the browser will use, of the two the chord and radius allow. */
  const centreOf = (arc: (typeof arcs)[number]) => {
    const mx = (arc.x1 + arc.x2) / 2;
    const my = (arc.y1 + arc.y2) / 2;
    const dx = arc.x2 - arc.x1;
    const dy = arc.y2 - arc.y1;
    const half = Math.hypot(dx, dy) / 2;
    // Clamped because a chord equal to the diameter leaves nothing under the
    // root, and floating point can push it a hair negative.
    const height = Math.sqrt(Math.max(0, arc.r * arc.r - half * half));
    const sign = arc.sweep === 1 ? -1 : 1;
    const scale = half === 0 ? 0 : height / (half * 2);
    return { x: mx + sign * dy * scale, y: my - sign * dx * scale };
  };

  const byNodeAndRadius = new Map<string, { x: number; y: number }[]>();
  for (const arc of arcs) {
    const centre = centreOf(arc);
    for (const node of [arc.a, arc.b]) {
      const key = `${node}@${arc.r}`;
      const seen = byNodeAndRadius.get(key);
      if (seen) seen.push(centre);
      else byNodeAndRadius.set(key, [centre]);
    }
  }

  // Every coordinate in the file is rounded to a whole unit, and on a short
  // chord under a large radius that rounding moves the implied centre by a few
  // units — the measured worst case across the tree is four. A flipped sweep
  // moves it by twice the ring's height, which is hundreds. The threshold sits
  // an order of magnitude above the noise and an order below a real fault.
  const TOLERANCE = 25;
  const disagreeing: string[] = [];
  for (const [key, centres] of byNodeAndRadius) {
    if (centres.length < 2) continue;
    const [first] = centres;
    if (centres.some((one) => Math.hypot(one.x - first.x, one.y - first.y) > TOLERANCE)) disagreeing.push(key);
  }
  assert.deepEqual(disagreeing, [], "arcs on one ring resolve to different centres — a sweep is flipped");

  // And the check has to be able to fail: flip one arc and it must be caught.
  // Without this the test passes just as happily against a tolerance that has
  // been loosened until nothing trips it.
  const flipped = { ...arcs[0], sweep: arcs[0].sweep === 1 ? 0 : 1 };
  const apart = Math.hypot(
    centreOf(flipped).x - centreOf(arcs[0]).x,
    centreOf(flipped).y - centreOf(arcs[0]).y,
  );
  assert.ok(apart > TOLERANCE, `a flipped sweep moves the centre only ${apart.toFixed(1)} units`);
});

/**
 * A connection is only as visible as the quieter of its two ends.
 *
 * An unallocated mastery is drawn transparent, and a hidden ascendancy is
 * display:none, so a link to either has to be hidden the same way. Left
 * visible, those are lines running to a point with nothing on it — 368 of them
 * in the first version of this file, which is what reading the tree as "errant
 * lines almost everywhere" turns out to be.
 *
 * The rules are written by class and the page lights by id, so specificity
 * brings a link back the moment both its ends are allocated.
 */
test("no connection outlives the node at either end of it", () => {
  const svg = fs.readFileSync(path.join(process.cwd(), "public", "trees", `${versions[0]}.svg`), "utf8");

  const classesOf = (markup: string) => /class="([^"]*)"/.exec(markup)?.[1] ?? "";
  const hiddenNodes = new Map<string, "mastery" | "ascendancy">();
  for (const match of svg.matchAll(/<circle id="n(\d+)"([^>]*)>/g)) {
    const classes = classesOf(match[2]);
    if (classes.includes("mastery")) hiddenNodes.set(match[1], "mastery");
    else if (classes.includes("ascendancy")) hiddenNodes.set(match[1], "ascendancy");
  }
  assert.ok(hiddenNodes.size > 300, `only ${hiddenNodes.size} hidden nodes — has the tree changed shape?`);

  const exposed: string[] = [];
  for (const match of svg.matchAll(/<(?:line|path)([^>]*)id="c(\d+)-(\d+)"([^>]*)>/g)) {
    const classes = `${classesOf(match[1])} ${classesOf(match[4])}`;
    for (const end of [match[2], match[3]]) {
      const hiddenBy = hiddenNodes.get(end);
      if (hiddenBy && !classes.includes(hiddenBy)) exposed.push(`c${match[2]}-${match[3]} -> n${end}`);
    }
  }
  assert.deepEqual(exposed.slice(0, 8), [], `${exposed.length} connections run to a node that is not drawn`);
});

/** And the stylesheet that does the hiding has to actually be in the file. */
test("the generated tree hides a mastery and its links together", () => {
  const svg = fs.readFileSync(path.join(process.cwd(), "public", "trees", `${versions[0]}.svg`), "utf8");
  assert.match(svg, /\.nodes circle\.mastery\{color:transparent\}/);
  assert.match(svg, /\.connections \.mastery\{color:transparent\}/);
});
