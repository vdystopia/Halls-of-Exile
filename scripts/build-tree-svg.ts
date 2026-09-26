/**
 * Draw each passive tree version once, as a static SVG.
 *
 *   npm run tree:svg                 # every version the archive needs
 *   npm run tree:svg -- 3.29 3.25    # just these
 *   npm run tree:svg -- --list       # what is on disk now
 *   npm run tree:svg -- 3.28.alternate   # an event's alternate-ascendancy tree
 *
 * Grinding Gear Games publish the tree as `data.json` in their own
 * `skilltree-export` repository — 6.7 MB of nodes, groups, stats and sprite
 * coordinates, one branch per version. That file is far too big to send to a
 * browser and describes the tree in polar coordinates, so this turns it into
 * what a browser can actually draw: one `<circle>` per node at a resolved x/y,
 * one `<line>` or `<path>` per connection, and nothing else.
 *
 * The output is deliberately dumb. It holds no notion of which nodes a
 * character allocated — it is the *empty* tree, identical for every character
 * who played that version, so it is one cacheable file rather than one render
 * per character. Allocation is a stylesheet the page builds at runtime:
 * `#n1234 { color: … }`. Both nodes and lines inherit `currentColor`, so one
 * rule per id lights a node or an edge, and switching characters costs the
 * number of allocated nodes rather than a redraw of three thousand.
 *
 * Ascendancies are moved. In GGG's data each of the 37 ascendancy clusters sits
 * far outside the main tree in its own corner, which would make the viewBox
 * four times the size it needs to be for a tree where only one of them is ever
 * shown. Every cluster is relocated to the same spot in the top right and the
 * page reveals one with a class selector.
 *
 * Node ids are stable across versions, but positions are not: a third of an old
 * build's nodes sit somewhere else on the current tree. So a build is drawn
 * against the tree it was made on, and each version it needs is generated here.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { parseLuaTable } from "./lua-table";
import { arcPath, NODE_RADIUS, type NodeKind, orbitAngle, orbitPoint } from "../src/lib/games/poe1/tree-geometry";

/**
 * The versions the archive currently has characters for. Generating every
 * version GGG publish would be ten megabytes of SVG for trees nobody here has
 * played. When a build from an older version is archived, add its number and
 * re-run; nothing else has to change.
 */
const VERSIONS = ["3.29", "3.28.alternate"];

const OUTPUT_ROOT = path.join(process.cwd(), "public", "trees");
/** Server-side data per version, beside the code that reads it. */
const DATA_ROOT = path.join(process.cwd(), "src", "lib", "games", "poe1", "tree-data");
const REPO = "grindinggear/skilltree-export";
const RAW = (sha: string) => `https://raw.githubusercontent.com/${REPO}/${sha}/data.json`;
/**
 * Path of Building's own copy of each tree, for the ones Grinding Gear Games
 * never exported. The Phrecia-style events (Legacy of Phrecia, Return of the
 * Ancestors) ran on an alternate tree whose ascendancies and bloodlines are
 * absent from `skilltree-export`, and Path of Building writes such a build's
 * version as `3_28_alternate`, which the parser reads as "3.28.alternate".
 */
const POB_REPO = "PathOfBuildingCommunity/PathOfBuilding";
const POB_TREE = (version: string) => `src/TreeData/${version.replace(/\./g, "_")}/tree.lua`;

/** Where every ascendancy cluster is moved to, in tree units. */
const ASCENDANCY_ORIGIN = { x: 7000, y: -7700 };

type Node = {
  skill?: number;
  name?: string;
  icon?: string;
  stats?: string[];
  reminderText?: string[];
  group?: number;
  orbit?: number;
  orbitIndex?: number;
  out?: string[];
  in?: string[];
  isNotable?: boolean;
  isKeystone?: boolean;
  isMastery?: boolean;
  isJewelSocket?: boolean;
  isProxy?: boolean;
  isBlighted?: boolean;
  isAscendancyStart?: boolean;
  ascendancyName?: string;
  classStartIndex?: number;
  /**
   * Set on a jewel socket that belongs to the cluster jewel system. A `parent`
   * means the socket lives *inside* another jewel rather than on the tree.
   */
  expansionJewel?: { size?: number; index?: number; proxy?: string; parent?: string };
  masteryEffects?: { effect: number; stats?: string[] }[];
};

type Group = { x: number; y: number; orbits?: number[]; nodes?: string[]; isProxy?: boolean };

type Tree = {
  /** Each class's ascendancies, by id and by the name a build is saved with. */
  classes?: { name: string; ascendancies?: { id: string; name: string }[] }[];
  nodes: Record<string, Node>;
  groups: Record<string, Group>;
  constants: { orbitRadii: number[]; skillsPerOrbit: number[] };
  /** Socket node ids in the order the game numbers jewel slots. */
  jewelSlots?: number[];
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
};

/** What the page needs to know about a node to draw and describe it. */
type Placed = {
  id: string;
  x: number;
  y: number;
  kind: NodeKind;
  name: string;
  stats: string;
  ascendancy?: string;
  /** An ascendancy's own start node: drawn smaller, and never allocatable. */
  start?: boolean;
  /**
   * The centre of the orbit this node sits on, after any relocation. Carried
   * because an arc between two nodes of the same orbit has to be measured about
   * *this* point to know which way round the ring is the short way — measuring
   * about the SVG origin instead gets it right half the time, by luck, and
   * sends the other half the long way round as a stray loop across the tree.
   */
  cx: number;
  cy: number;
};

/**
 * Shared with the cluster layout so a cluster's nodes are the same sizes as the
 * tree's, and so the two place passives by exactly the same rule.
 */
const RADIUS = NODE_RADIUS;

function kindOf(node: Node): Placed["kind"] {
  // Where the character began. Every build allocates one, so counting it as a
  // node the tree could not draw would report a phantom missing passive.
  if (node.classStartIndex !== undefined) return "Start";
  if (node.isKeystone) return "Keystone";
  if (node.isMastery) return "Mastery";
  if (node.isJewelSocket) return "Jewel";
  if (node.isNotable) return node.ascendancyName ? "Ascendancy" : "Notable";
  if (node.ascendancyName) return "Ascendancy";
  return "Normal";
}

/**
 * Where a node sits. GGG give a group centre and a position on one of seven
 * concentric orbits around it; the angle comes from the node's index into that
 * orbit, and `orbitAngle` holds the rule — including the uneven spacing of the
 * 16- and 40-slot orbits, which this file got wrong until it shared the rule
 * with the cluster layout.
 */
function place(node: Node, tree: Tree): { x: number; y: number; cx: number; cy: number } | null {
  const group = node.group === undefined ? undefined : tree.groups[String(node.group)];
  if (!group) return null;
  const orbit = node.orbit ?? 0;
  const radius = tree.constants.orbitRadii[orbit] ?? 0;
  const angle = orbitAngle(node.orbitIndex ?? 0, tree.constants.skillsPerOrbit[orbit] ?? 1);
  const at = orbitPoint(group.x, group.y, radius, angle);
  return { x: at.x, y: at.y, cx: group.x, cy: group.y };
}

/** XML-safe, for names and stat text that go into attributes. */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const round = (value: number) => Math.round(value);

/**
 * Which commit holds a given version's tree.
 *
 * The export repository has only two branches — master and royale — and marks
 * versions by commit message instead: "3.29.1", "3.28.0j", "3.27.0 preview".
 * So a version is resolved by walking the history for the newest commit whose
 * message starts with it, skipping the previews, which are pre-launch drafts
 * that were superseded by the release a few days later.
 *
 * Doing it this way rather than writing down a table of hashes means asking for
 * a version the archive has never needed just works.
 */
async function commitFor(version: string): Promise<string> {
  const previews: { sha: string; message: string }[] = [];
  for (let page = 1; page <= 4; page += 1) {
    const response = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=100&page=${page}`, {
      headers: {
        accept: "application/vnd.github+json",
        // Anonymous is 60 requests an hour per address, far more than the
        // handful this needs; a token lifts it if that ever becomes the limit.
        ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`the commit list returned HTTP ${response.status}`);
    const commits = (await response.json()) as { sha: string; commit: { message: string } }[];
    if (!commits.length) break;
    for (const commit of commits) {
      const message = commit.commit.message.split("\n")[0].trim();
      // "3.29" must match "3.29.1" but never "3.290"; the boundary matters.
      if (!new RegExp(`^${version.replace(/\./g, "\\.")}(\\D|$)`).test(message)) continue;
      if (/preview/i.test(message)) {
        previews.push({ sha: commit.sha, message });
        continue;
      }
      return commit.sha;
    }
  }
  // A version still in preview has no release commit yet, which is a real state
  // for a league that has just been announced — take the draft and say so.
  if (previews.length) {
    process.stdout.write(`  only a preview exists for ${version} (${previews[0].message})\n`);
    return previews[0].sha;
  }
  throw new Error(`no commit in ${REPO} names version "${version}"`);
}

/** The newest commit of Path of Building's that touched a file. */
async function pobCommitFor(file: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${POB_REPO}/commits?path=${encodeURIComponent(file)}&per_page=1`, {
    headers: {
      accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`the commit list returned HTTP ${response.status}`);
  const [commit] = (await response.json()) as { sha: string }[];
  if (!commit) throw new Error(`Path of Building has no ${file}`);
  return commit.sha;
}

async function fetchTree(version: string): Promise<{ tree: Tree; sha: string }> {
  if (version.endsWith(".alternate")) {
    const file = POB_TREE(version);
    const sha = await pobCommitFor(file);
    const url = `https://raw.githubusercontent.com/${POB_REPO}/${sha}/${file}`;
    process.stdout.write(`  ${url}\n`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Path of Building's tree returned HTTP ${response.status}`);
    return { tree: parseLuaTable(await response.text()) as Tree, sha };
  }
  const sha = await commitFor(version);
  process.stdout.write(`  ${RAW(sha)}\n`);
  const response = await fetch(RAW(sha));
  if (!response.ok) throw new Error(`the tree export returned HTTP ${response.status}`);
  return { tree: (await response.json()) as Tree, sha };
}

function build(tree: Tree, version: string, sha: string): string {
  const placed = new Map<string, Placed>();
  // Each ascendancy is shifted by the offset that puts its own start node at
  // the shared origin, so the cluster keeps its internal shape.
  const ascendancyShift = new Map<string, { dx: number; dy: number }>();
  for (const node of Object.values(tree.nodes)) {
    if (!node.isAscendancyStart || !node.ascendancyName) continue;
    const at = place(node, tree);
    if (!at) continue;
    ascendancyShift.set(node.ascendancyName, {
      dx: ASCENDANCY_ORIGIN.x - at.x,
      dy: ASCENDANCY_ORIGIN.y - at.y,
    });
  }

  for (const [id, node] of Object.entries(tree.nodes)) {
    // "root" is a synthetic hub joining the seven class starts, and a proxy is
    // an anchor for cluster jewel expansion. Neither is a passive.
    if (id === "root" || node.isProxy) continue;
    // Blighted nodes belong to a league mechanic's own overlay, not the tree.
    if (node.isBlighted) continue;
    // A jewel socket with a parent is one of the sockets *inside* a cluster
    // jewel — 18 small and 18 medium — and only exists once such a jewel is
    // socketed. The export positions them exactly where an expanded cluster
    // sits, beyond the large socket, so on an empty tree they drew as isolated
    // dots and three-node chains off its corners. They are not lost: the tree
    // data written beside this file keeps them, and the cluster layout places
    // one wherever a character's socketed jewel actually has it. The 18 basic
    // sockets and the 6 large ones have no parent and are drawn here.
    if (node.expansionJewel?.parent !== undefined) continue;
    const at = place(node, tree);
    if (!at) continue;

    const shift = node.ascendancyName ? ascendancyShift.get(node.ascendancyName) : undefined;
    placed.set(id, {
      id,
      x: round(at.x + (shift?.dx ?? 0)),
      y: round(at.y + (shift?.dy ?? 0)),
      kind: kindOf(node),
      cx: at.cx + (shift?.dx ?? 0),
      cy: at.cy + (shift?.dy ?? 0),
      name: node.name ?? "",
      // Joined with a separator the page splits on: an attribute cannot hold a
      // newline reliably and a stat can contain almost any punctuation.
      stats: (node.stats ?? []).join(" ;; "),
      ascendancy: node.ascendancyName,
      start: node.isAscendancyStart,
    });
  }

  // One entry per pair. `out` and `in` mirror each other, so taking both and
  // keying on the sorted pair draws each connection once.
  const edges = new Map<string, { a: Placed; b: Placed; sameOrbit: boolean; radius: number }>();
  for (const [id, node] of Object.entries(tree.nodes)) {
    const from = placed.get(id);
    if (!from) continue;
    for (const otherId of [...(node.out ?? []), ...(node.in ?? [])]) {
      const to = placed.get(otherId);
      if (!to) continue;
      // An ascendancy cluster is self-contained; a line from one to the main
      // tree would be drawn across the whole viewBox after the relocation.
      if (from.ascendancy !== to.ascendancy) continue;
      const key = id < otherId ? `${id}-${otherId}` : `${otherId}-${id}`;
      if (edges.has(key)) continue;
      const other = tree.nodes[otherId];
      // Two nodes on the same orbit of the same group are joined by an arc of
      // that orbit, which is what makes the tree's rings read as rings rather
      // than as polygons.
      const sameOrbit =
        node.group !== undefined &&
        node.group === other.group &&
        node.orbit !== undefined &&
        node.orbit === other.orbit &&
        (node.orbit ?? 0) > 0;
      edges.set(key, {
        a: from,
        b: to,
        sameOrbit,
        radius: sameOrbit ? (tree.constants.orbitRadii[node.orbit ?? 0] ?? 0) : 0,
      });
    }
  }

  const drawn = [...placed.values()];
  const pad = 250;
  const xs = drawn.map((node) => node.x);
  const ys = drawn.map((node) => node.y);
  // The canvas has to hold the clusters a character might expand as well as the
  // empty tree. They grow out beyond the large sockets, on the proxy groups the
  // export names, to at most the third orbit — so each proxy group's reach is
  // counted in, although nothing there is drawn on the empty tree.
  const reach = (tree.constants.orbitRadii[3] ?? 335) + RADIUS.Notable;
  for (const node of Object.values(tree.nodes)) {
    const proxy = node.expansionJewel?.proxy ? tree.nodes[node.expansionJewel.proxy] : undefined;
    const group = proxy?.group === undefined ? undefined : tree.groups[String(proxy.group)];
    if (!group) continue;
    xs.push(group.x - reach, group.x + reach);
    ys.push(group.y - reach, group.y + reach);
  }
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) + pad - minX;
  const height = Math.max(...ys) + pad - minY;

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(minX)} ${round(minY)} ${round(width)} ${round(height)}" data-tree-version="${version}" data-source-commit="${sha}">`,
  );
  // Colours are the archive's own, and every one is a custom property so the
  // page can recolour the tree without regenerating it.
  lines.push(
    `<style>` +
      // The archive's own tokens: surface, line-strong, gold, gold-bright. The
      // unallocated tree has to read as a map without competing with the path
      // drawn on it, which is what line-strong is for everywhere else.
      `svg{--tree-bg:#131110;--tree-off:#4a3f31;--tree-on:#c8aa6e;--tree-hot:#e8d9a8;` +
      `background-color:var(--tree-bg);color:var(--tree-off)}` +
      `.connections{fill:none;stroke:currentColor;stroke-width:18}` +
      `.nodes circle{stroke:currentColor;fill:currentColor;stroke-width:130;stroke-opacity:0}` +
      `.nodes circle:hover{color:var(--tree-hot)}` +
      // Both the mastery and its links stay invisible until it is allocated,
      // at which point the page's `#n…` and `#c…` rules win on specificity and
      // bring the pair back together.
      `.nodes circle.mastery{color:transparent}` +
      `.connections .mastery{color:transparent}` +
      // A class start is where the character began: drawn as a ring rather than
      // a disc so it reads as an origin, and it does light up, because every
      // build allocates exactly one and leaving it dark makes the count wrong.
      `.nodes circle.classstart{fill:none;stroke-width:24;stroke-opacity:1}` +
      `.nodes circle.start{color:var(--tree-off);opacity:.45}` +
      `.ascendancy{display:none}` +
      `</style>`,
  );

  lines.push(`<g class="connections">`);
  for (const edge of edges.values()) {
    const id = `c${edge.a.id}-${edge.b.id}`;
    // A connection is only as visible as the quieter of its two ends. An
    // unallocated mastery is drawn transparent, so its links have to be too —
    // left visible they are 368 lines running to a point with nothing on it,
    // which is what "errant lines" turns out to mean nearly everywhere.
    const classes = [
      edge.a.ascendancy ? `ascendancy asc-${escape(edge.a.ascendancy)}` : "",
      edge.a.kind === "Mastery" || edge.b.kind === "Mastery" ? "mastery" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const ascendancy = classes ? ` class="${classes}"` : "";
    if (edge.sameOrbit) {
      // `arcPath` decides which side of the chord the arc bulges, measuring
      // both ends about the orbit's own centre. Half the arcs curved inward
      // across their group when that was measured about the SVG origin.
      const d = arcPath(edge.a, edge.b, { x: edge.a.cx, y: edge.a.cy }, edge.radius);
      lines.push(`<path d="${d}" id="${id}"${ascendancy}/>`);
    } else {
      lines.push(
        `<line x1="${edge.a.x}" y1="${edge.a.y}" x2="${edge.b.x}" y2="${edge.b.y}" id="${id}"${ascendancy}/>`,
      );
    }
  }
  lines.push(`</g>`);

  lines.push(`<g class="nodes">`);
  for (const node of drawn) {
    const classes = [
      node.kind === "Mastery" ? "mastery" : "",
      node.kind === "Start" ? "classstart" : "",
      node.start ? "start" : "",
      node.ascendancy ? `ascendancy asc-${escape(node.ascendancy)}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(
      `<circle id="n${node.id}" cx="${node.x}" cy="${node.y}" r="${RADIUS[node.kind]}"` +
        (classes ? ` class="${classes}"` : "") +
        ` data-kind="${node.kind}" data-name="${escape(node.name)}"` +
        (node.stats ? ` data-stats="${escape(node.stats)}"` : "") +
        `/>`,
    );
  }
  lines.push(`</g>`);
  lines.push(`</svg>`);
  return lines.join("\n");
}

/**
 * What the cluster jewel layout needs from one version of the tree, and nothing
 * else — written beside the SVG, read only on the server.
 *
 * A cluster expands on a *proxy* group that the export names but draws nothing
 * on, positions its nested sockets by their index within that group, and names
 * its notables and keystones after nodes that sit in no group at all. None of
 * that is in the drawn SVG, so it is carried here: every expansion socket with
 * where it would sit, every proxy group's centre, the jewel slot order the
 * game's own endpoint numbers sockets by, and the groupless notables by name.
 */
function clusterSupport(tree: Tree, version: string, sha: string) {
  const sockets: Record<string, unknown> = {};
  const proxyGroups: Record<string, { group: number; x: number; y: number; orbit: number; orbitIndex: number }> = {};
  const clusterNodes: Record<string, { stats: string[]; keystone?: true }> = {};
  // Every mastery effect by its id. A build records which effect it chose for
  // each allocated mastery — as an id — and the tooltip shows that effect's text
  // rather than the mastery's bare name.
  const masteryEffects: Record<string, string[]> = {};
  for (const node of Object.values(tree.nodes)) {
    for (const effect of node.masteryEffects ?? []) masteryEffects[String(effect.effect)] = effect.stats ?? [];
  }
  // Path of Building finds a nested socket by searching a group's own node list
  // and taking the first with the right index — so the order is kept, per group,
  // exactly as the export lists it.
  const groupSockets: Record<string, number[]> = {};
  for (const [groupId, group] of Object.entries(tree.groups)) {
    const ids = (group.nodes ?? []).filter((id) => tree.nodes[id]?.isJewelSocket && tree.nodes[id]?.expansionJewel);
    if (ids.length) groupSockets[groupId] = ids.map(Number);
  }

  for (const [id, node] of Object.entries(tree.nodes)) {
    const expansion = node.expansionJewel;
    if (node.isJewelSocket && expansion) {
      const at = place(node, tree);
      sockets[id] = {
        name: node.name ?? "Jewel Socket",
        size: expansion.size ?? 0,
        index: expansion.index ?? 0,
        proxy: Number(expansion.proxy),
        ...(expansion.parent !== undefined ? { parent: Number(expansion.parent) } : {}),
        group: node.group,
        orbit: node.orbit ?? 0,
        orbitIndex: node.orbitIndex ?? 0,
        x: at ? round(at.x) : 0,
        y: at ? round(at.y) : 0,
      };
      const proxy = expansion.proxy ? tree.nodes[expansion.proxy] : undefined;
      const group = proxy?.group === undefined ? undefined : tree.groups[String(proxy.group)];
      if (expansion.proxy && group && proxy?.group !== undefined) {
        // The proxy node's own orbit position is what builds saved before
        // Path of Building's cluster hash change used to rotate a cluster; the
        // legacy conversion needs it to map their ids onto today's.
        proxyGroups[expansion.proxy] = {
          group: proxy.group,
          x: group.x,
          y: group.y,
          orbit: proxy.orbit ?? 0,
          orbitIndex: proxy.orbitIndex ?? 0,
        };
      }
    }
    // Path of Building's `clusterNodeMap`: a notable or keystone whose group is
    // not on the tree is one a cluster jewel can add.
    const onTree = node.group !== undefined && tree.groups[String(node.group)];
    if (!onTree && (node.isNotable || node.isKeystone) && node.name && !node.ascendancyName) {
      clusterNodes[node.name] = { stats: node.stats ?? [], ...(node.isKeystone ? { keystone: true as const } : {}) };
    }
  }

  // A build is saved with its ascendancy's display name, and the tree marks
  // passives with the id: the alternate tree's Bog Shaman is `Necromancer`'s
  // slot, and on 3.29 the Warden is `Raider` while `Warden` is Warden of the
  // Maji. Only names that differ from their id are kept, and the first class
  // to claim a name keeps it: the alternate tree calls both of the Scion's
  // slots Scavenger, and only Ascendant's has passives there.
  const ascendancies: Record<string, string> = {};
  for (const one of tree.classes ?? []) {
    for (const ascendancy of one.ascendancies ?? []) {
      if (!ascendancy.name || ascendancy.name === ascendancy.id || ascendancy.name in ascendancies) continue;
      ascendancies[ascendancy.name] = ascendancy.id;
    }
  }

  return {
    version,
    commit: sha,
    ascendancies,
    orbitRadii: tree.constants.orbitRadii,
    skillsPerOrbit: tree.constants.skillsPerOrbit,
    jewelSlots: tree.jewelSlots ?? [],
    sockets,
    proxyGroups,
    groupSockets,
    clusterNodes,
    masteryEffects,
  };
}

/**
 * The server imports each version's data statically, so a bundler can see it —
 * a path built from a version string at request time is invisible to the build
 * and missing from the standalone image. This index is regenerated from
 * whatever versions are on disk.
 */
function writeTreeDataIndex(root: string) {
  const versions = fs
    .readdirSync(root)
    .filter((file) => /^\d[\w.]*\.json$/.test(file))
    .map((file) => file.replace(/\.json$/, ""))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const name = (version: string) => `v${version.replace(/\W/g, "_")}`;
  const source = [
    "// Written by scripts/build-tree-svg.ts. Do not edit by hand.",
    'import type { TreeData } from "../clusters";',
    ...versions.map((version) => `import ${name(version)} from "./${version}.json";`),
    "",
    "export const TREE_DATA: Record<string, TreeData> = {",
    ...versions.map((version) => `  "${version}": ${name(version)} as unknown as TreeData,`),
    "};",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(root, "index.ts"), source);
}

async function main() {
  if (process.argv.includes("--list")) {
    const files = fs.existsSync(OUTPUT_ROOT) ? fs.readdirSync(OUTPUT_ROOT) : [];
    process.stdout.write(files.length ? `${files.join("\n")}\n` : "no trees generated yet\n");
    return;
  }

  const asked = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  const versions = asked.length ? asked : VERSIONS;
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const built: { version: string; sha: string; nodes: number }[] = [];

  for (const version of versions) {
    process.stdout.write(`${version}\n`);
    const { tree, sha } = await fetchTree(version);
    const svg = build(tree, version, sha);
    const destination = path.join(OUTPUT_ROOT, `${version}.svg`);
    fs.writeFileSync(destination, svg);
    const raw = Buffer.byteLength(svg);
    // What the browser actually pays: the server compresses this in transit.
    const compressed = zlib.gzipSync(svg, { level: 9 }).length;
    const nodes = (svg.match(/<circle /g) ?? []).length;
    const edges = (svg.match(/<line |<path /g) ?? []).length;
    process.stdout.write(
      `  ${nodes} nodes, ${edges} connections — ${(raw / 1024).toFixed(0)} KB raw, ` +
        `${(compressed / 1024).toFixed(0)} KB gzipped\n`,
    );
    const support = clusterSupport(tree, version, sha);
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    const dataFile = path.join(DATA_ROOT, `${version}.json`);
    fs.writeFileSync(dataFile, `${JSON.stringify(support)}\n`);
    process.stdout.write(
      `  cluster data: ${Object.keys(support.sockets).length} sockets, ` +
        `${Object.keys(support.clusterNodes).length} cluster notables — ` +
        `${(fs.statSync(dataFile).size / 1024).toFixed(0)} KB\n`,
    );
    built.push({ version, sha, nodes });
  }
  writeTreeDataIndex(DATA_ROOT);

  // What the server is allowed to point a character at. Written rather than
  // read off the directory at request time, so a tree that was never generated
  // fails as a missing version rather than as a 404 inside an <object> the page
  // has already committed to drawing.
  const index = path.join(process.cwd(), "src", "lib", "games", "poe1", "tree-versions.json");
  const existing: typeof built = fs.existsSync(index)
    ? (JSON.parse(fs.readFileSync(index, "utf8")) as { versions: typeof built }).versions
    : [];
  const merged = [...existing.filter((entry) => !built.some((one) => one.version === entry.version)), ...built].sort(
    (a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }),
  );
  fs.writeFileSync(index, `${JSON.stringify({ versions: merged }, null, 2)}\n`);
  process.stdout.write(`trees available: ${merged.map((entry) => entry.version).join(", ")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
