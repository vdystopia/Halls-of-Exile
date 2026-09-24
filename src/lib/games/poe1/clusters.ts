import clusterJewels from "./cluster-jewels.json";
import { arcPath, NODE_RADIUS, type NodeKind, orbitAngle, orbitPoint } from "./tree-geometry";
import type { ClusterGraph, ClusterJewelData, TreeSpec } from "../../types";

/**
 * Cluster jewels, laid out on the passive tree.
 *
 * A cluster is not on the tree until a jewel is socketed: its passives, and the
 * smaller sockets inside it, come into existence then, on a "proxy" group the
 * tree names beyond each large socket. So the empty tree cannot hold them, and a
 * character's clusters are placed separately and drawn over it.
 *
 * There are two routes, because the two import sources know different things:
 *
 *   - **The game's endpoint** returns each expanded cluster already laid out —
 *     groups and nodes in the same schema as the main tree — and says which of
 *     its passives are allocated. `layoutFromGraphs` only has to place them.
 *
 *   - **Path of Building** stores the jewel's item text and the ids it invented
 *     for the allocated passives, so the layout has to be rebuilt exactly as it
 *     builds it, or those ids point at nothing. `layoutFromJewels` is a port of
 *     its `PassiveSpecClass:BuildSubgraph`, and its tables come from its own
 *     `Data/ClusterJewels.lua` via `npm run clusters:index`.
 *
 * The two are tested against each other: the game's layout of a character's
 * clusters, and this port's layout of the same jewels, must agree slot for slot.
 */

/** What one version of the tree contributes. Written by `npm run tree:svg`. */
export type TreeData = {
  version: string;
  commit: string;
  orbitRadii: number[];
  skillsPerOrbit: number[];
  jewelSlots: number[];
  sockets: Record<
    string,
    {
      name: string;
      size: number;
      index: number;
      proxy: number;
      parent?: number;
      group: number;
      orbit: number;
      orbitIndex: number;
      x: number;
      y: number;
    }
  >;
  proxyGroups: Record<string, { group: number; x: number; y: number; orbit: number; orbitIndex: number }>;
  /** Expansion sockets per group, in the order the export lists the group's nodes. */
  groupSockets: Record<string, number[]>;
  clusterNodes: Record<string, { stats: string[]; keystone?: true }>;
};

type JewelDef = {
  size: "Small" | "Medium" | "Large";
  sizeIndex: number;
  minNodes: number;
  maxNodes: number;
  smallIndicies: number[];
  notableIndicies: number[];
  socketIndicies: number[];
  totalIndicies: number;
  skills: Record<string, { name: string; stats: string[]; enchant: string[] }>;
};

const DATA = clusterJewels as unknown as {
  jewels: Record<string, JewelDef>;
  notableSortOrder: Record<string, number>;
  keystones: string[];
  orbitOffsets: Record<string, Record<string, number>>;
};

const NOTABLES_BY_LOWER = new Map(Object.keys(DATA.notableSortOrder).map((name) => [name.toLowerCase(), name]));
const KEYSTONES_BY_LOWER = new Map(DATA.keystones.map((name) => [name.toLowerCase(), name]));

export type ClusterNode = {
  id: number;
  x: number;
  y: number;
  r: number;
  kind: NodeKind;
  name: string;
  stats: string[];
  allocated: boolean;
};

/** A connection, with its geometry already worked out: an arc path or a line. */
export type ClusterEdge = {
  id: string;
  a: number;
  b: number;
  d?: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
};

export type ClusterLayout = { nodes: ClusterNode[]; edges: ClusterEdge[] };

/**
 * Strip what surrounds a mod line: Path of Building's `{crafted}` and
 * `{range:…}` prefixes, and the `  ·  crafted` tag this archive's own item
 * parser appends.
 */
function cleanLine(line: string): string {
  return line
    .replace(/^(\{[^}]*\})+/, "")
    .replace(/\s+·\s+\w+$/, "")
    .trim();
}

/**
 * The cluster base inside an item's name. A rare or unique names its base on a
 * line of its own, but a magic item is one line — "Notable Medium Cluster Jewel",
 * possibly with a suffix after it — so the base has to be found within it. Taking
 * the name whole read every magic cluster as no cluster at all.
 */
export function clusterBase(name: string): string | undefined {
  const match = /\b(Small|Medium|Large) Cluster Jewel\b/.exec(name);
  return match ? `${match[1]} Cluster Jewel` : undefined;
}

/**
 * Read a cluster jewel's layout inputs from its mod lines.
 *
 * The rules are Path of Building's own (`ModParser`, `Item:BuildModList`): the
 * node count, the socket count, the small-passive enchant and the notables each
 * come from one kind of line, and a jewel is only laid out if it passes the same
 * validity test. The enchant is matched per size, which is what separates a
 * small curse cluster from a medium one — their text is identical.
 *
 * `lines` can be Path of Building item text or the game's own mod lists; both
 * spell these lines the same way.
 */
export function readClusterJewel(name: string, lines: string[]): ClusterJewelData | null {
  const base = clusterBase(name);
  const def = base ? DATA.jewels[base] : undefined;
  if (!base || !def) return null;

  const jewel: ClusterJewelData = { base, notables: [], addedMods: [], valid: false };
  const present = new Set<string>();
  let headerSkill: string | undefined;
  let headerCount: number | undefined;

  // The game sends a two-line enchant as one mod with a newline inside it, so
  // lines are split before anything is matched; six skills depend on this, and
  // without it every trap-and-mine cluster was read as having no skill at all.
  for (const raw of lines.flatMap((line) => line.split(/\r?\n/))) {
    const line = cleanLine(raw);
    if (!line) continue;
    const lower = line.toLowerCase();
    present.add(lower);

    // Path of Building's own header fields, written on every cluster it saves.
    const skillHeader = /^cluster jewel skill:\s*(\S+)$/i.exec(line);
    if (skillHeader) headerSkill = skillHeader[1];
    const countHeader = /^cluster jewel node count:\s*(\d+)$/i.exec(line);
    if (countHeader) headerCount = Number(countHeader[1]);

    let match: RegExpExecArray | null;
    if ((match = /^adds (\d+) passive skills$/.exec(lower))) jewel.nodeCount = Number(match[1]);
    else if (lower === "1 added passive skill is a jewel socket") jewel.socketCount = 1;
    else if ((match = /^(\d+) added passive skills are jewel sockets$/.exec(lower))) jewel.socketCount = Number(match[1]);
    else if ((match = /^adds (\d+) jewel socket passive skills$/.exec(lower))) jewel.socketCountOverride = Number(match[1]);
    else if ((match = /^adds (\d+) small passive skills? which grants? nothing$/.exec(lower)))
      jewel.nothingnessCount = Number(match[1]);
    else if (lower === "added small passive skills grant nothing") jewel.smallsNothing = true;
    else if ((match = /^1 added passive skill is (.+)$/.exec(lower)) && NOTABLES_BY_LOWER.has(match[1]))
      jewel.notables.push(NOTABLES_BY_LOWER.get(match[1]) as string);
    else if ((match = /^adds (.+)$/.exec(lower)) && KEYSTONES_BY_LOWER.has(match[1]))
      jewel.keystone = KEYSTONES_BY_LOWER.get(match[1]);
    else if ((match = /^added small passive skills also grant: (.+)$/i.exec(line))) jewel.addedMods.push(match[1]);
  }

  // A skill is present when every one of its enchant lines is; six skills have
  // two. The most specific match wins, so a two-line skill is not mistaken for
  // a one-line skill that happens to share its first line.
  let best: { id: string; lines: number } | undefined;
  for (const [id, skill] of Object.entries(def.skills)) {
    if (!skill.enchant.length || !skill.enchant.every((line) => present.has(line.toLowerCase()))) continue;
    if (!best || skill.enchant.length > best.lines) best = { id, lines: skill.enchant.length };
  }
  jewel.skill = best?.id ?? (headerSkill && def.skills[headerSkill] ? headerSkill : undefined);
  jewel.nodeCount ??= headerCount;

  if (jewel.nodeCount !== undefined) {
    jewel.nodeCount = Math.min(Math.max(jewel.nodeCount, def.minNodes), def.maxNodes);
  }
  jewel.valid = Boolean(
    jewel.keystone ||
      ((jewel.skill || jewel.smallsNothing) && jewel.nodeCount) ||
      (jewel.socketCountOverride && jewel.nothingnessCount),
  );
  return jewel;
}

/**
 * Move a position between two numberings of the same ring. A cluster template
 * has 6 or 12 slots, the orbit it lands on has 16, and the game maps one onto
 * the other with these tables — Path of Building's `TranslateClusterOrbitIndex`.
 */
function translateOrbitIndex(index: number, from: number, to: number): number {
  if (from === to) return index;
  if (from === 12 && to === 16) return [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15][index];
  if (from === 16 && to === 12) return [0, 1, 1, 2, 3, 4, 4, 5, 6, 7, 7, 8, 9, 10, 10, 11][index];
  if (from === 6 && to === 16) return [0, 3, 5, 8, 11, 13][index];
  if (from === 16 && to === 6) return [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5][index];
  // Path of Building's own fallback for a combination no patch has shipped.
  return Math.floor((index * to) / from);
}

/** The template slot a cluster's n-th socket takes, and which nested socket it is. */
function socketSlots(def: JewelDef, count: number): { slot: number; jewelIndex: number }[] {
  // A large cluster with a single socket always puts it in the middle.
  if (def.size === "Large" && count === 1) return [{ slot: 6, jewelIndex: 1 }];
  const jewelIndices = [0, 2, 1];
  return def.socketIndicies.slice(0, count).map((slot, i) => ({ slot, jewelIndex: jewelIndices[i] }));
}

/** Where a slot of a cluster template lands on the tree's orbit. */
function templateToOrbit(def: JewelDef, slot: number, proxy: number, tree: TreeData): number {
  const orbit = def.sizeIndex + 1;
  const start = DATA.orbitOffsets[String(proxy)]?.[String(def.sizeIndex)] ?? 0;
  return translateOrbitIndex((slot + start) % def.totalIndicies, def.totalIndicies, tree.skillsPerOrbit[orbit]);
}

/**
 * Path of Building's `FindClusterSocket`: the first socket in a group's own node
 * list with the given index. First in *that* order — a group can hold sockets of
 * more than one size with the same index, and which one it finds decides the id.
 */
function findSocket(tree: TreeData, group: number | undefined, jewelIndex: number) {
  if (group === undefined) return undefined;
  for (const id of tree.groupSockets[String(group)] ?? []) {
    const socket = tree.sockets[String(id)];
    if (socket?.index === jewelIndex) return { id, ...socket };
  }
  return undefined;
}

function nestedSocket(tree: TreeData, proxy: number, jewelIndex: number) {
  return findSocket(tree, tree.proxyGroups[String(proxy)]?.group, jewelIndex);
}

/**
 * Path of Building's `BuildLegacyProxyGroup`. Before its cluster hash change, a
 * cluster smaller than its socket was laid out as though the socket had been
 * downsized: it descended into a nested socket's proxy group, and chose its own
 * nested sockets there. Following the same steps recovers the socket ids an old
 * save refers to.
 */
function legacyGroup(tree: TreeData, proxyGroup: number, socketSize: number, sizeIndex: number): number {
  let group = proxyGroup;
  let size = socketSize;
  for (let guard = 0; sizeIndex < size && guard < 4; guard += 1) {
    const socket = findSocket(tree, group, 1) ?? findSocket(tree, group, 0);
    if (!socket) break;
    const next = tree.proxyGroups[String(socket.proxy)]?.group;
    if (next === undefined) break;
    group = next;
    size = socket.size;
  }
  return group;
}

type Placed = { node: ClusterNode; group: string; orbit: number; centre: { x: number; y: number } };

function place(
  centre: { x: number; y: number },
  orbit: number,
  orbitIndex: number,
  tree: TreeData,
): { x: number; y: number } {
  const radius = tree.orbitRadii[orbit] ?? 0;
  return orbitPoint(centre.x, centre.y, radius, orbitAngle(orbitIndex, tree.skillsPerOrbit[orbit] ?? 1));
}

/**
 * Join two placed nodes. Nodes on the same orbit of the same group are joined
 * along the ring, as the game draws them; anything else by a straight line.
 */
function connect(a: Placed | { node: { id: number; x: number; y: number } }, b: Placed | { node: { id: number; x: number; y: number } }, tree: TreeData): ClusterEdge {
  const [first, second] = a.node.id < b.node.id ? [a, b] : [b, a];
  const id = `c${first.node.id}-${second.node.id}`;
  if ("group" in first && "group" in second && first.group === second.group && first.orbit === second.orbit && first.orbit > 0) {
    return { id, a: first.node.id, b: second.node.id, d: arcPath(first.node, second.node, first.centre, tree.orbitRadii[first.orbit]) };
  }
  return {
    id,
    a: first.node.id,
    b: second.node.id,
    x1: Math.round(first.node.x),
    y1: Math.round(first.node.y),
    x2: Math.round(second.node.x),
    y2: Math.round(second.node.y),
  };
}

function finish(placed: Placed[], edges: Map<string, ClusterEdge>): ClusterLayout {
  return {
    nodes: placed.map(({ node }) => ({ ...node, x: Math.round(node.x), y: Math.round(node.y) })),
    edges: [...edges.values()],
  };
}

/**
 * Lay out a Path of Building build's clusters: a port of its `BuildSubgraph`.
 *
 * Only a large socket starts a cluster, and only when it is allocated and holds
 * a valid jewel; a cluster's own sockets are followed on the same terms. Every
 * rule below is Path of Building's, in its order — including the medium-cluster
 * exceptions, which are what make a 4- or 5-node medium cluster sit the way the
 * game draws it.
 *
 * The node ids are the point. Path of Building numbers a cluster's passives from
 * 65536 up, packing the large socket's index, the medium socket's index, the
 * cluster's size and the passive's template slot into the bits; the build stores
 * those numbers as its allocation. Reproduce them and the allocation lines up;
 * get one bit wrong and the tree lights nothing.
 *
 * `format` is the spec's `clusterHashFormatVersion`. A save from before Path of
 * Building changed how it chooses nested sockets and rotates clusters is format
 * 1, and its socket and passive ids are the old ones; see `convertLegacy`.
 */
export function layoutFromJewels(
  allocated: ReadonlySet<number>,
  jewels: ReadonlyMap<number, ClusterJewelData>,
  tree: TreeData,
  format = 2,
): ClusterLayout {
  return format >= 2 ? buildClusters(allocated, jewels, tree, null) : convertLegacy(allocated, jewels, tree);
}

/** Old ids to new, gathered while clusters are built; `seen` marks clusters already converted. */
type Legacy = { seen: Set<number>; map: Map<number, number> };

/**
 * Bring a format-1 save onto today's ids, and keep what it allocated.
 *
 * Path of Building converts an old save as it rebuilds the clusters: it records
 * which old socket and passive ids correspond to which new ones, then moves the
 * allocation and the socketed jewels across. It rebuilds once, though, and a
 * jewel moved onto a new socket id is only moved *after* that socket's own
 * cluster would have been built — so a cluster nested inside a converted socket
 * is not built at all, and its allocation is dropped. A Lone Messenger inside a
 * medium cluster in a large socket vanishes that way.
 *
 * This archive records what a character was, so the conversion is run to a
 * fixed point instead: convert, rebuild, and convert whatever the rebuild newly
 * reached, until nothing new appears. Each cluster's mappings are applied once,
 * the first time it is built — applying them again would chain an id that had
 * already moved onto another.
 */
function convertLegacy(
  allocated: ReadonlySet<number>,
  jewels: ReadonlyMap<number, ClusterJewelData>,
  tree: TreeData,
): ClusterLayout {
  let held = new Set(allocated);
  let socketed = new Map(jewels);
  const seen = new Set<number>();
  // Three levels of nesting at most — large, medium, small — so four passes
  // always reach the end.
  for (let pass = 0; pass < 4; pass += 1) {
    const legacy: Legacy = { seen, map: new Map() };
    const before = seen.size;
    const layout = buildClusters(held, socketed, tree, legacy);
    if (seen.size === before) return layout;
    // Path of Building only moves an id onto one that now exists.
    const exists = new Set(layout.nodes.map((node) => node.id));
    const move = (id: number) => {
      const to = legacy.map.get(id);
      return to !== undefined && exists.has(to) ? to : id;
    };
    held = new Set([...held].map(move));
    socketed = new Map([...socketed].map(([socket, jewel]) => [move(socket), jewel]));
  }
  return buildClusters(held, socketed, tree, null);
}

function buildClusters(
  allocated: ReadonlySet<number>,
  jewels: ReadonlyMap<number, ClusterJewelData>,
  tree: TreeData,
  legacy: Legacy | null,
): ClusterLayout {
  const placed: Placed[] = [];
  const edges = new Map<string, ClusterEdge>();

  const build = (
    jewel: ClusterJewelData,
    parentId: number,
    parent: Placed | { node: { id: number; x: number; y: number } },
    baseId: number,
  ) => {
    const expansion = tree.sockets[String(parentId)];
    const def = DATA.jewels[jewel.base];
    if (!expansion || !def) return;

    // 0x10000 marks a cluster id; bits 6–8 carry the large socket's index and
    // bits 9–10 the medium socket's, bits 4–5 the cluster's size, 0–3 the slot.
    let id = baseId;
    if (expansion.size === 2) id += expansion.index << 6;
    else if (expansion.size === 1) id += expansion.index << 9;
    const nodeId = id + (def.sizeIndex << 4);

    const proxy = expansion.proxy;
    const proxyGroup = tree.proxyGroups[String(proxy)];
    if (!proxyGroup) return;
    const centre = { x: proxyGroup.x, y: proxyGroup.y };
    const group = `proxy-${proxy}`;
    // Converting an old save: record this cluster's mappings the first time it
    // is built, and never again.
    const converting = legacy !== null && !legacy.seen.has(nodeId);
    legacy?.seen.add(nodeId);

    if (jewel.keystone) {
      const node: ClusterNode = {
        id: nodeId,
        ...place(centre, 0, 0, tree),
        r: NODE_RADIUS.Keystone,
        kind: "Keystone",
        name: jewel.keystone,
        stats: tree.clusterNodes[jewel.keystone]?.stats ?? [],
        allocated: allocated.has(nodeId),
      };
      const entry: Placed = { node, group, orbit: 0, centre };
      placed.push(entry);
      const edge = connect(entry, parent, tree);
      edges.set(edge.id, edge);
      return;
    }

    // Notables are placed in a fixed order, not the order the item lists them.
    const notables: string[] = [];
    for (const name of jewel.notables) {
      // An older tree without one of the jewel's notables: Path of Building
      // drops the whole cluster rather than draw part of it.
      if (!tree.clusterNodes[name]) return;
      notables.push(name);
    }
    notables.sort((a, b) => DATA.notableSortOrder[a] - DATA.notableSortOrder[b]);

    const skill = (jewel.skill && def.skills[jewel.skill]) || { name: "Nothingness", stats: [] as string[] };
    const socketCount = jewel.socketCountOverride ?? jewel.socketCount ?? 0;
    const notableCount = notables.length;
    const nodeCount = jewel.nodeCount ?? socketCount + notableCount + (jewel.nothingnessCount ?? 0);
    const smallCount = nodeCount - socketCount - notableCount;

    type Slot = { id: number; kind: NodeKind; name: string; stats: string[] };
    const slots = new Map<number, Slot>();

    // First pass: sockets, which are real tree nodes found by their index.
    if (socketCount > def.socketIndicies.length && !(def.size === "Large" && socketCount === 1)) return;
    const oldGroup = converting ? legacyGroup(tree, proxyGroup.group, expansion.size, def.sizeIndex) : undefined;
    for (const { slot, jewelIndex } of socketSlots(def, socketCount)) {
      const socket = nestedSocket(tree, proxy, jewelIndex);
      if (!socket) return;
      if (legacy && oldGroup !== undefined) {
        const old = findSocket(tree, oldGroup, jewelIndex);
        if (old) legacy.map.set(old.id, socket.id);
      }
      // The id is the tree socket Path of Building borrows, which is what its
      // allocation refers to. The name is what the socket accepts, as the game
      // labels it: a medium cluster sitting in a large socket borrows one of
      // that socket's *medium* sockets, but the socket it offers only takes a
      // small jewel. Path of Building keeps the borrowed label; the game does not.
      const name = def.size === "Large" ? "Medium Jewel Socket" : "Small Jewel Socket";
      slots.set(slot, { id: socket.id, kind: "Jewel", name, stats: [] });
    }

    // Second pass: notables, into the notable slots left free.
    const notableSlots: number[] = [];
    for (let slot of def.notableIndicies) {
      if (notableSlots.length === notableCount) break;
      if (def.size === "Medium") {
        if (socketCount === 0 && notableCount === 2) {
          if (slot === 6) slot = 4;
          else if (slot === 10) slot = 8;
        } else if (nodeCount === 4) {
          if (slot === 10) slot = 9;
          else if (slot === 2) slot = 3;
        }
      }
      if (!slots.has(slot)) notableSlots.push(slot);
    }
    notableSlots.sort((a, b) => a - b);
    notables.forEach((name, index) => {
      const slot = notableSlots[index];
      if (slot === undefined) return;
      slots.set(slot, { id: nodeId + slot, kind: "Notable", name, stats: tree.clusterNodes[name]?.stats ?? [] });
    });

    // Third pass: small passives fill what is left.
    const smallSlots: number[] = [];
    for (let slot of def.smallIndicies) {
      if (smallSlots.length === smallCount) break;
      if (def.size === "Medium") {
        if (nodeCount === 5 && slot === 4) slot = 3;
        else if (nodeCount === 4) {
          if (slot === 8) slot = 9;
          else if (slot === 4) slot = 3;
        }
      }
      if (!slots.has(slot)) smallSlots.push(slot);
    }
    for (let index = 0; index < smallCount; index += 1) {
      const slot = smallSlots[index];
      if (slot === undefined) break;
      slots.set(slot, {
        id: nodeId + slot,
        kind: "Normal",
        name: skill.name,
        stats: [...skill.stats, ...jewel.addedMods],
      });
    }

    // Every cluster is entered at slot 0.
    if (!slots.has(0)) return;

    const orbit = def.sizeIndex + 1;
    const bySlot = new Map<number, Placed>();

    // Path of Building's `BuildLegacyClusterOrbitMappings`. An old save rotated
    // a cluster by the proxy node's own orbit position, where today's table of
    // offsets is used instead; where the two put a different passive at the
    // same spot, the old id is mapped to the one now there.
    if (legacy && converting) {
      const legacySkills = tree.skillsPerOrbit[proxyGroup.orbit] ?? 1;
      const skills = tree.skillsPerOrbit[orbit] ?? 1;
      const total = def.totalIndicies;
      const legacyStart = translateOrbitIndex(proxyGroup.orbitIndex, legacySkills, total);
      const oldAt = new Map<number, number>();
      const nowAt = new Map<number, number>();
      for (const [slot, entry] of slots) {
        oldAt.set(translateOrbitIndex((slot + legacyStart) % total, total, legacySkills), entry.id);
        const current = translateOrbitIndex(templateToOrbit(def, slot, proxy, tree), skills, total);
        nowAt.set(translateOrbitIndex(current, total, legacySkills), entry.id);
      }
      for (const [at, oldId] of oldAt) {
        const nowId = nowAt.get(at);
        if (nowId !== undefined && nowId !== oldId) legacy.map.set(oldId, nowId);
      }
    }

    for (const [slot, entry] of slots) {
      const orbitIndex = templateToOrbit(def, slot, proxy, tree);
      const node: ClusterNode = {
        id: entry.id,
        ...place(centre, orbit, orbitIndex, tree),
        r: NODE_RADIUS[entry.kind],
        kind: entry.kind,
        name: entry.name,
        stats: entry.stats,
        allocated: allocated.has(entry.id),
      };
      const one: Placed = { node, group, orbit, centre };
      bySlot.set(slot, one);
      placed.push(one);
    }

    // Round the ring in template order, closed unless the cluster is small.
    let first: Placed | undefined;
    let last: Placed | undefined;
    for (let slot = 0; slot < def.totalIndicies; slot += 1) {
      const here = bySlot.get(slot);
      if (!here) continue;
      if (!first) first = here;
      if (last) {
        const edge = connect(here, last, tree);
        edges.set(edge.id, edge);
      }
      last = here;
    }
    if (first && last && first !== last && def.size !== "Small") {
      const edge = connect(first, last, tree);
      edges.set(edge.id, edge);
    }
    const entrance = bySlot.get(0) as Placed;
    const link = connect(entrance, parent, tree);
    edges.set(link.id, link);

    // Down into the cluster's own sockets, on the same terms as the first.
    for (const here of bySlot.values()) {
      if (here.node.kind !== "Jewel") continue;
      const inner = jewels.get(here.node.id);
      if (inner?.valid && allocated.has(here.node.id)) build(inner, here.node.id, here, id);
    }
  };

  for (const [socketId, socket] of Object.entries(tree.sockets)) {
    if (socket.size !== 2) continue;
    const id = Number(socketId);
    const jewel = jewels.get(id);
    if (!jewel?.valid || !allocated.has(id)) continue;
    build(jewel, id, { node: { id, x: socket.x, y: socket.y } }, 0x10000);
  }

  return finish(placed, edges);
}

/**
 * Place the game's own cluster layouts.
 *
 * The endpoint numbers a cluster's passives with small local keys and draws the
 * sockets inside it as local nodes too; a nested cluster, though, is joined to
 * the *real* tree socket it sits in. So each local socket is resolved to that
 * real socket with the same rule Path of Building uses to choose it — its index
 * within the proxy group — and every other local key is moved clear of the
 * tree's own ids, which it would otherwise collide with.
 */
export function layoutFromGraphs(
  graphs: ClusterGraph[],
  extended: ReadonlySet<number>,
  tree: TreeData,
): ClusterLayout {
  const LOCAL = 2_000_000;
  const placed: Placed[] = [];
  const byId = new Map<number, Placed>();
  const edges = new Map<string, ClusterEdge>();
  const idOf = new Map<string, number>(); // `${slot}:${key}` -> drawn id

  for (const graph of graphs) {
    const passives = graph.nodes.filter((node) => node.kind !== "Mastery");
    const sockets = passives.filter((node) => node.kind === "Jewel");
    const orbit = passives[0]?.orbit ?? 0;
    const def = Object.values(DATA.jewels).find((jewel) => jewel.sizeIndex === orbit - 1);
    if (def && sockets.length) {
      for (const { slot, jewelIndex } of socketSlots(def, sockets.length)) {
        const orbitIndex = templateToOrbit(def, slot, graph.proxy, tree);
        const local = sockets.find((node) => node.orbitIndex === orbitIndex);
        const real = nestedSocket(tree, graph.proxy, jewelIndex);
        if (local && real) idOf.set(`${graph.slot}:${local.key}`, real.id);
      }
    }
    for (const node of passives) {
      if (!idOf.has(`${graph.slot}:${node.key}`)) idOf.set(`${graph.slot}:${node.key}`, LOCAL + Number(node.key));
    }
  }

  for (const graph of graphs) {
    const centre = { x: graph.x, y: graph.y };
    const group = `slot-${graph.slot}`;
    for (const node of graph.nodes) {
      if (node.kind === "Mastery") continue;
      const id = idOf.get(`${graph.slot}:${node.key}`) as number;
      const kind: NodeKind = node.kind;
      const drawn: ClusterNode = {
        id,
        ...place(centre, node.orbit, node.orbitIndex, tree),
        r: NODE_RADIUS[kind],
        kind,
        // A small passive that grants nothing comes back unnamed; Path of
        // Building calls it Nothingness, and so does this, so the two routes
        // read the same and a tooltip is never blank.
        name: node.name || (kind === "Normal" ? "Nothingness" : ""),
        stats: node.stats,
        allocated: extended.has(Number(node.key)),
      };
      const one: Placed = { node: drawn, group, orbit: node.orbit, centre };
      placed.push(one);
      byId.set(id, one);
    }
  }

  // A link names a key in the same cluster, or failing that a real tree node —
  // the socket the cluster hangs from.
  const endpoint = (graph: ClusterGraph, ref: string) => {
    const local = idOf.get(`${graph.slot}:${ref}`);
    if (local !== undefined) return byId.get(local);
    const id = Number(ref);
    const drawn = byId.get(id);
    if (drawn) return drawn;
    const socket = tree.sockets[ref];
    return socket ? { node: { id, x: socket.x, y: socket.y } } : undefined;
  };

  for (const graph of graphs) {
    for (const node of graph.nodes) {
      if (node.kind === "Mastery") continue;
      const from = byId.get(idOf.get(`${graph.slot}:${node.key}`) as number);
      if (!from) continue;
      for (const ref of node.links) {
        const to = endpoint(graph, ref);
        if (!to || to.node.id === from.node.id) continue;
        const edge = connect(from, to, tree);
        edges.set(edge.id, edge);
      }
    }
  }

  return finish(placed, edges);
}

/**
 * Which ids the page should light.
 *
 * On the main tree that is the stored allocation. Inside a cluster it is the
 * layout's word, not the stored list's: an old save names its cluster passives
 * and nested sockets by ids the conversion has since moved, and some of those
 * old ids now belong to a *different* passive — lighting them as stored would
 * light the wrong node. So cluster ids and nested sockets are taken from the
 * layout, and everything else from the build.
 */
export function drawnAllocation(tree: TreeSpec, layout: ClusterLayout | null, data: TreeData | undefined): number[] {
  const nested = new Set(
    Object.entries(data?.sockets ?? {})
      .filter(([, socket]) => socket.parent !== undefined)
      .map(([id]) => Number(id)),
  );
  const main = (tree.nodes ?? []).filter((id) => id < 0x10000 && !nested.has(id));
  const clusters = layout?.nodes.filter((node) => node.allocated).map((node) => node.id) ?? [];
  return [...new Set([...main, ...clusters])];
}

/**
 * A character's clusters, laid out against the tree being drawn. The game's own
 * layout is used where the character has one; otherwise Path of Building's is
 * rebuilt from the jewels.
 */
export function clusterLayout(tree: TreeSpec | undefined, data: TreeData | undefined): ClusterLayout | null {
  if (!tree || !data) return null;
  if (tree.clusterGraphs?.length) {
    return layoutFromGraphs(tree.clusterGraphs, new Set(tree.extendedNodes ?? []), data);
  }
  if (tree.clusterJewels?.length) {
    const jewels = new Map(tree.clusterJewels.map((entry) => [entry.socket, entry.jewel]));
    return layoutFromJewels(new Set(tree.nodes ?? []), jewels, data, tree.clusterHashFormat ?? 2);
  }
  return null;
}
