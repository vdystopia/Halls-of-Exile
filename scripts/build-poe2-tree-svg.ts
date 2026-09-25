/**
 * Draw Path of Exile 2's passive tree, once per version, as a static SVG.
 *
 *   npm run tree:poe2                  # every version the archive needs
 *   npm run tree:poe2 -- 0.4 0.5       # just these
 *
 * The same output as Path of Exile 1's `tree:svg` — the *empty* tree, one
 * `<circle id="n<skill>">` per passive and one `<line>`/`<path id="c<a>-<b>">`
 * per connection, every one coloured by `currentColor` — so `PassiveTree` lights
 * a Path of Exile 2 build with the same stylesheet it uses for Path of Exile 1.
 *
 * The source is Path of Building 2's own `src/TreeData/<version>/tree.json`,
 * because it is versioned exactly as its share codes are (`treeVersion="0_5"`)
 * and so a build is drawn on the tree it was saved against. pathofexile2.com's
 * tree (kept by `tree:poe2:snapshot`) is the check rather than the source: it is
 * unversioned, but it carries the positions the game itself draws, and on 0.5
 * every passive on the main tree placed here lands within a few units of it
 * (`tests/poe2-tree.test.ts`).
 *
 * Three things differ from Path of Exile 1's export:
 *
 *   - Groups are a list and a node's `group` counts from 1, as Lua does.
 *   - Orbit angles are given outright (`constants.orbitAnglesByOrbit`) rather
 *     than derived from a slot count.
 *   - A connection can carry its own `orbit`: non-zero draws it as an arc of that
 *     orbit's radius, bending one way or the other by its sign, when the two
 *     passives are close enough for such an arc to join them — Path of Building
 *     2's `BuildConnector`, which this follows. Otherwise it is a straight line,
 *     except between two passives on the same orbit of the same group, which is
 *     an arc about that group's centre, as in Path of Exile 1.
 *
 * A "choose one" ascendancy passive (Deadeye's Projectile Proximity
 * Specialisation) is drawn; its options (Point Blank, Far Shot) are nodes of
 * their own in the data and a pop-up in the game, so they are written hidden —
 * present, so an allocated one counts as placed, and invisible. Which option a
 * build took is written to `src/lib/games/poe2/tree-data/<version>.json` for the
 * server, which names it in the parent's tooltip.
 *
 * Ascendancies are moved. The export scatters all twenty-two far outside the
 * tree; the game draws a character's own ascendancy in the empty centre of it,
 * inside the ring of class starts. So each is shifted and scaled to fit there,
 * all on the same spot, and the page reveals only the character's.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { arcPath, NODE_RADIUS, type NodeKind } from "../src/lib/games/poe1/tree-geometry";

/** The versions the archive has builds for. A code from another is drawn on the newest until it is added here. */
const VERSIONS = ["0.2", "0.3", "0.4", "0.5"];

const REPO = "PathOfBuildingCommunity/PathOfBuilding-PoE2";
const BRANCH = "dev";
const OUTPUT_ROOT = path.join(process.cwd(), "public", "trees", "poe2");
const INDEX = path.join(process.cwd(), "src", "lib", "games", "poe2", "tree-versions.json");
const DATA_ROOT = path.join(process.cwd(), "src", "lib", "games", "poe2", "tree-data");

/**
 * The centre of the tree, where an ascendancy is drawn, and the radius it has to
 * fit inside: the class starts sit on a ring about 1,470 units out, so 1,150
 * leaves a clear gap for their own circles.
 */
const ASCENDANCY_CENTRE = { x: 0, y: 0 };
const ASCENDANCY_FIT = 1150;

type Connection = { id: number; orbit: number };
type Node = {
  skill: number;
  name?: string;
  stats?: string[];
  group?: number;
  orbit?: number;
  orbitIndex?: number;
  connections?: Connection[];
  isNotable?: boolean;
  isKeystone?: boolean;
  isJewelSocket?: boolean;
  isAscendancyStart?: boolean;
  isOnlyImage?: boolean;
  isAttribute?: boolean;
  isMultipleChoice?: boolean;
  isMultipleChoiceOption?: boolean;
  ascendancyName?: string;
  classesStart?: string[];
};
type Group = { x: number; y: number; orbits?: number[]; nodes?: number[] };
type Tree = {
  nodes: Record<string, Node>;
  groups: (Group | null)[];
  constants: { orbitRadii: number[]; orbitAnglesByOrbit: number[][] };
};

type Placed = {
  id: number;
  x: number;
  y: number;
  kind: NodeKind;
  name: string;
  stats: string;
  ascendancy?: string;
  start?: boolean;
  attribute?: boolean;
  /** One option of a "choose one" passive: kept in the document, never shown. */
  option?: boolean;
  /** The group's centre, moved with the node, for arcs between two nodes of one orbit. */
  cx: number;
  cy: number;
  /** How much this node's ascendancy was scaled, which scales every arc inside it. */
  scale: number;
  group?: number;
  orbit?: number;
};

function kindOf(node: Node): NodeKind {
  if (node.classesStart?.length) return "Start";
  if (node.isKeystone) return "Keystone";
  if (node.isJewelSocket) return "Jewel";
  if (node.isNotable) return node.ascendancyName ? "Ascendancy" : "Notable";
  if (node.ascendancyName) return "Ascendancy";
  return "Normal";
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A class-safe token for an ascendancy: its name with spaces as underscores. */
export function ascendancyToken(name: string): string {
  return name.replace(/\s+/g, "_");
}

const round = (value: number) => Math.round(value);

/** The commit a version's tree was last changed in, recorded in the SVG for provenance. */
async function commitFor(file: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/commits?path=${file}&sha=${BRANCH}&per_page=1`, {
    headers: {
      accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!response.ok) return BRANCH;
  const commits = (await response.json()) as { sha: string }[];
  return commits[0]?.sha ?? BRANCH;
}

async function fetchTree(version: string): Promise<{ tree: Tree; sha: string }> {
  const file = `src/TreeData/${version.replace(/\./g, "_")}/tree.json`;
  const sha = await commitFor(file);
  const url = `https://raw.githubusercontent.com/${REPO}/${sha}/${file}`;
  process.stdout.write(`  ${url}\n`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Path of Building 2 has no tree for ${version} (HTTP ${response.status})`);
  return { tree: (await response.json()) as Tree, sha };
}

/** A node's position before any ascendancy is moved. */
export function place(node: Node, tree: Tree): { x: number; y: number; cx: number; cy: number } | null {
  if (node.group === undefined) return null;
  const group = tree.groups[node.group - 1];
  if (!group) return null;
  const orbit = node.orbit ?? 0;
  const radius = tree.constants.orbitRadii[orbit] ?? 0;
  const angle = tree.constants.orbitAnglesByOrbit[orbit]?.[node.orbitIndex ?? 0] ?? 0;
  return { x: group.x + Math.sin(angle) * radius, y: group.y - Math.cos(angle) * radius, cx: group.x, cy: group.y };
}

export function build(tree: Tree, version: string, sha: string): { svg: string; placed: Map<number, Placed> } {
  const drawable = Object.values(tree.nodes).filter(
    // A picture with no passive behind it (the art behind a group), and the hub
    // joining the class starts, are not passives.
    (node) => node.skill !== undefined && !node.isOnlyImage && node.group !== undefined,
  );

  // Where each ascendancy goes: its bounding box centred on the tree's centre,
  // scaled down only if it would not otherwise fit inside the class-start ring.
  const bounds = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();
  for (const node of drawable) {
    if (!node.ascendancyName) continue;
    const at = place(node, tree);
    if (!at) continue;
    const box = bounds.get(node.ascendancyName) ?? { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    box.minX = Math.min(box.minX, at.x);
    box.maxX = Math.max(box.maxX, at.x);
    box.minY = Math.min(box.minY, at.y);
    box.maxY = Math.max(box.maxY, at.y);
    bounds.set(node.ascendancyName, box);
  }
  const move = new Map<string, { bx: number; by: number; scale: number }>();
  for (const [name, box] of bounds) {
    const half = Math.max(box.maxX - box.minX, box.maxY - box.minY) / 2 + NODE_RADIUS.Ascendancy;
    move.set(name, {
      bx: (box.minX + box.maxX) / 2,
      by: (box.minY + box.maxY) / 2,
      scale: Math.min(1, ASCENDANCY_FIT / half),
    });
  }
  const moved = (name: string | undefined, x: number, y: number) => {
    const shift = name ? move.get(name) : undefined;
    if (!shift) return { x, y, scale: 1 };
    return {
      x: ASCENDANCY_CENTRE.x + (x - shift.bx) * shift.scale,
      y: ASCENDANCY_CENTRE.y + (y - shift.by) * shift.scale,
      scale: shift.scale,
    };
  };

  const placed = new Map<number, Placed>();
  for (const node of drawable) {
    const at = place(node, tree);
    if (!at) continue;
    const point = moved(node.ascendancyName, at.x, at.y);
    const centre = moved(node.ascendancyName, at.cx, at.cy);
    placed.set(node.skill, {
      id: node.skill,
      x: point.x,
      y: point.y,
      cx: centre.x,
      cy: centre.y,
      scale: point.scale,
      kind: kindOf(node),
      name: node.name ?? "",
      stats: (node.stats ?? []).join(" ;; "),
      ascendancy: node.ascendancyName,
      start: node.isAscendancyStart,
      attribute: node.isAttribute,
      option: node.isMultipleChoiceOption,
      group: node.group,
      orbit: node.orbit,
    });
  }

  // One path per connected pair, by Path of Building 2's rule for its shape.
  const edges = new Map<string, string>();
  const edgeClass = new Map<string, string>();
  for (const node of drawable) {
    const a = placed.get(node.skill);
    if (!a) continue;
    for (const connection of node.connections ?? []) {
      const b = placed.get(connection.id);
      if (!b) continue;
      // An ascendancy is drawn by itself in the centre; a line from it to the
      // main tree would cross the whole tree.
      if (a.ascendancy !== b.ascendancy) continue;
      // An option joins its parent in the data, not on the tree.
      if (a.option || b.option) continue;
      const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
      const key = `c${lo.id}-${hi.id}`;
      if (edges.has(key)) continue;
      edges.set(key, connectorPath(a, b, connection.orbit, tree));
      if (a.ascendancy) edgeClass.set(key, `ascendancy asc-${escape(ascendancyToken(a.ascendancy))}`);
    }
  }

  const drawn = [...placed.values()];
  const pad = 400;
  const xs = drawn.map((node) => node.x);
  const ys = drawn.map((node) => node.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) + pad - minX;
  const height = Math.max(...ys) + pad - minY;

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(minX)} ${round(minY)} ${round(width)} ${round(height)}" data-tree-version="${version}" data-game="poe2" data-source-commit="${sha}">`,
  );
  lines.push(
    `<style>` +
      `svg{--tree-bg:#131110;--tree-off:#4a3f31;--tree-on:#c8aa6e;--tree-hot:#e8d9a8;` +
      `background-color:var(--tree-bg);color:var(--tree-off)}` +
      `.connections{fill:none;stroke:currentColor;stroke-width:22}` +
      `.nodes circle{stroke:currentColor;fill:currentColor;stroke-width:130;stroke-opacity:0}` +
      `.nodes circle:hover{color:var(--tree-hot)}` +
      `.nodes circle.classstart{fill:none;stroke-width:24;stroke-opacity:1}` +
      `.nodes circle.start{color:var(--tree-off);opacity:.45}` +
      // "+5 to any Attribute" passives: a ring, since what they grant is the
      // character's choice, which the page reports on hover.
      `.nodes circle.attribute{fill-opacity:.55}` +
      `.nodes circle.option{display:none!important}` +
      `.ascendancy{display:none}` +
      `</style>`,
  );

  lines.push(`<g class="connections">`);
  for (const [id, d] of edges) {
    const classes = edgeClass.get(id);
    lines.push(`<path d="${d}" id="${id}"${classes ? ` class="${classes}"` : ""}/>`);
  }
  lines.push(`</g>`);

  lines.push(`<g class="nodes">`);
  for (const node of drawn) {
    const classes = [
      node.kind === "Start" ? "classstart" : "",
      node.start ? "start" : "",
      node.attribute ? "attribute" : "",
      node.option ? "option" : "",
      node.ascendancy ? `ascendancy asc-${escape(ascendancyToken(node.ascendancy))}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(
      `<circle id="n${node.id}" cx="${round(node.x)}" cy="${round(node.y)}" r="${round(NODE_RADIUS[node.kind] * node.scale)}"` +
        (classes ? ` class="${classes}"` : "") +
        ` data-kind="${node.kind}" data-name="${escape(node.name)}"` +
        (node.stats ? ` data-stats="${escape(node.stats)}"` : "") +
        `/>`,
    );
  }
  lines.push(`</g>`);
  lines.push(`</svg>`);
  return { svg: lines.join("\n"), placed };
}

/**
 * The shape of one connection, following Path of Building 2's `BuildConnector`:
 * an arc of the connection's own orbit where it names one and the two ends are
 * close enough to share such a circle; an arc about the group's centre between
 * two passives of one orbit; a straight line otherwise.
 */
function connectorPath(a: Placed, b: Placed, orbit: number, tree: Tree): string {
  const radii = tree.constants.orbitRadii;
  const straight = `M ${round(a.x)} ${round(a.y)} L ${round(b.x)} ${round(b.y)}`;
  if (orbit !== 0 && radii[Math.abs(orbit)] !== undefined) {
    const r = radii[Math.abs(orbit)] * a.scale;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < r * 2) {
      const perp = Math.sqrt(r * r - (dist * dist) / 4) * (orbit > 0 ? 1 : -1);
      const centre = { x: a.x + dx / 2 + perp * (dy / dist), y: a.y + dy / 2 - perp * (dx / dist) };
      return arcPath(a, b, centre, r);
    }
    return straight;
  }
  if (orbit === 0 && a.group === b.group && a.orbit === b.orbit && (a.orbit ?? 0) > 0) {
    return arcPath(a, b, { x: a.cx, y: a.cy }, (radii[a.orbit ?? 0] ?? 0) * a.scale);
  }
  return straight;
}

/**
 * What the server needs from a version and the SVG does not carry: each option
 * of a "choose one" passive, with the passive it belongs to and its own text.
 */
export function treeSupport(tree: Tree, version: string, sha: string) {
  const choices: Record<string, { parent: number; name: string; stats: string[] }> = {};
  for (const node of Object.values(tree.nodes)) {
    if (!node.isMultipleChoiceOption) continue;
    // The link is written on either side: an option naming its parent, or the
    // parent naming its options.
    const parent =
      (node.connections ?? []).map((connection) => tree.nodes[String(connection.id)]).find((other) => other?.isMultipleChoice) ??
      Object.values(tree.nodes).find(
        (other) => other.isMultipleChoice && (other.connections ?? []).some((connection) => connection.id === node.skill),
      );
    if (!parent) continue;
    choices[String(node.skill)] = { parent: parent.skill, name: node.name ?? "", stats: node.stats ?? [] };
  }
  return { version, commit: sha, choices };
}

/** Static imports of each version's data, so the standalone build contains them. */
function writeTreeDataIndex() {
  const versions = fs
    .readdirSync(DATA_ROOT)
    .filter((file) => /^\d[\w.]*\.json$/.test(file))
    .map((file) => file.replace(/\.json$/, ""))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const name = (version: string) => `v${version.replace(/\W/g, "_")}`;
  const source = [
    "// Written by scripts/build-poe2-tree-svg.ts. Do not edit by hand.",
    'import type { Poe2TreeData } from "../tree";',
    ...versions.map((version) => `import ${name(version)} from "./${version}.json";`),
    "",
    "export const TREE_DATA: Record<string, Poe2TreeData> = {",
    ...versions.map((version) => `  "${version}": ${name(version)} as Poe2TreeData,`),
    "};",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(DATA_ROOT, "index.ts"), source);
}

async function main() {
  const asked = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  const versions = asked.length ? asked : VERSIONS;
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const built: { version: string; sha: string; nodes: number }[] = [];

  for (const version of versions) {
    process.stdout.write(`${version}\n`);
    const { tree, sha } = await fetchTree(version);
    const { svg, placed } = build(tree, version, sha);
    const destination = path.join(OUTPUT_ROOT, `${version}.svg`);
    fs.writeFileSync(destination, svg);
    const edges = (svg.match(/<path /g) ?? []).length;
    process.stdout.write(
      `  ${placed.size} nodes, ${edges} connections — ${(Buffer.byteLength(svg) / 1024).toFixed(0)} KB raw, ` +
        `${(zlib.gzipSync(svg, { level: 9 }).length / 1024).toFixed(0)} KB gzipped\n`,
    );
    built.push({ version, sha, nodes: placed.size });
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    const support = treeSupport(tree, version, sha);
    fs.writeFileSync(path.join(DATA_ROOT, `${version}.json`), `${JSON.stringify(support)}\n`);
    process.stdout.write(`  ${Object.keys(support.choices).length} "choose one" options\n`);
  }
  writeTreeDataIndex();

  const existing: typeof built = fs.existsSync(INDEX)
    ? (JSON.parse(fs.readFileSync(INDEX, "utf8")) as { versions: typeof built }).versions
    : [];
  const merged = [...existing.filter((entry) => !built.some((one) => one.version === entry.version)), ...built].sort(
    (a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }),
  );
  fs.writeFileSync(INDEX, `${JSON.stringify({ versions: merged }, null, 2)}\n`);
  process.stdout.write(`trees available: ${merged.map((entry) => entry.version).join(", ")}\n`);
}

// Run only as a script, so a test can import `build` and `place`.
if (process.argv[1] && /build-poe2-tree-svg/.test(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
