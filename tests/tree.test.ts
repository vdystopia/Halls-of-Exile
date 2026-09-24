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
