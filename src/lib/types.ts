import type { GameId } from "./games/types";
import type { LeagueModifierId } from "./league-modifiers";

export type User = {
  id: number;
  username: string;
  firstName: string;
  /**
   * The Path of Exile account their characters are on, as "Name#1234". Set by
   * hand; it is what lets an export find its player without being told.
   */
  poeAccount: string | null;
  createdAt: string;
};

export type League = {
  id: number;
  game: GameId;
  /** URL segment and catalogue key: a patch for a league, its own for an event. */
  slug: string;
  /** null for an event with no patch of its own; shown as "###". */
  patch: string | null;
  /** "event" for a gauntlet, private league or race; null for a challenge league. */
  kind: string | null;
  /** The league an event ran inside. */
  parent: string | null;
  name: string;
  expansion: string | null;
  startDate: string | null;
  endDate: string | null;
  /** 1 when endDate is a projection rather than an announced date. */
  endDateEstimated: number;
  /** 1 when the dates themselves are unconfirmed, not just the end. */
  datesUncertain: number;
  /** null where the league has no challenges, or the count is not known. */
  challengeTotal: number | null;
  isCustom: number;
  sortOrder: number;
};

export type LeagueRecord = {
  leagueId: number;
  challengesCompleted: number | null;
  challengeTotal: number | null;
  notes: string | null;
};

/** A league row joined with the viewed player's progress in it. */
export type LeagueWithProgress = League & {
  characterCount: number;
  maxLevel: number | null;
  challengesCompleted: number | null;
  challengeTotalOverride: number | null;
  notes: string | null;
};

export type SocketGroupColor = "R" | "G" | "B" | "W" | "A" | "D";

export type ParsedItem = {
  id: number;
  slot?: string;
  rarity: string;
  name: string;
  base: string;
  itemLevel?: number;
  quality?: number;
  levelReq?: number;
  armour?: number;
  evasion?: number;
  energyShield?: number;
  /** Shields only: the item's total modified block chance. */
  block?: number;
  /** League mechanic values written into the item's header region. */
  intangibility?: string;
  memoryStrands?: string;
  sockets: SocketGroupColor[][];
  influences: string[];
  flags: string[];
  implicits: string[];
  explicits: string[];
  /**
   * The lines under "Requires", ready to render. Path of Building writes none,
   * so a build imported from it leaves this unset and the tooltip derives them
   * from the base; the official API reports the figures the game itself shows,
   * including a socketed gem's requirement, which cannot be derived.
   */
  requires?: { text: string; modified: boolean }[];
  /**
   * Display properties the model has no field for — a weapon's damage, a
   * flask's duration and charges — in the order the game lists them.
   */
  properties?: { name: string; value: string }[];
  /** The official CDN picture, used when the local art catalogue has none. */
  iconUrl?: string;
  /** Inventory footprint, for sizing art that came from the CDN. */
  size?: [number, number];
  raw: string;
};

export type Gem = {
  name: string;
  /** Path of Building's metadata id, e.g. Metadata/Items/Gems/SkillGemFireball. */
  gemId?: string;
  level: number | null;
  quality: number | null;
  enabled: boolean;
  support: boolean;
  count?: number;
  /**
   * The gem's attribute, where the source states it. The official API does;
   * Path of Building's export does not, and is looked up by id or name.
   */
  color?: "r" | "g" | "b" | "w";
};

export type SkillGroup = {
  label: string;
  slot?: string;
  enabled: boolean;
  isMain: boolean;
  gems: Gem[];
};

export type TreeSpec = {
  title?: string;
  url?: string;
  nodeCount: number;
  masteryCount: number;
  treeVersion?: string;
  /**
   * The allocated nodes, by the game's own skill id — what the tree on the
   * character page lights up. Both sources carry them (Path of Building in the
   * spec's `nodes` attribute, the game's endpoint in `passives.hashes`) and
   * both used to count them and throw them away, which left the archive holding
   * the number of a character's passives but not which ones.
   *
   * From Path of Building this also holds the ids it invents for allocated
   * cluster passives (65536 and up), which `clusterJewels` lets the page place.
   *
   * Optional because a row written before this existed has only the count, and
   * older rows must still render.
   */
  nodes?: number[];
  /**
   * Path of Building's route to a cluster: the jewel in each socket, read from
   * its item text. The layout is not stored — it is derived at render time, the
   * way Path of Building derives it, against whichever tree the page is drawing.
   */
  clusterJewels?: { socket: number; jewel: ClusterJewelData }[];
  /**
   * Path of Building's `clusterHashFormatVersion`. A spec saved before it had
   * this attribute is format 1 and refers to its clusters by the old ids, which
   * the layout converts; everything since is 2.
   */
  clusterHashFormat?: number;
  /**
   * The game's route to a cluster: its own layout of each expanded jewel,
   * straight from the character endpoint, with `extendedNodes` naming which of
   * those passives are allocated.
   */
  clusterGraphs?: ClusterGraph[];
  extendedNodes?: number[];
  /**
   * Which effect was chosen on each allocated mastery: mastery node id to
   * effect id. A mastery offers several and exactly one is active, so without
   * this the tree can only name the mastery, not say what it does. Both sources
   * record it — Path of Building as `masteryEffects="{node,effect},…"`, the
   * game's endpoint as `mastery_effects` — and the text comes from the tree.
   */
  masteryEffects?: Record<string, number>;
};

/**
 * A cluster jewel as Path of Building reads one: what it needs to lay the
 * cluster out, and nothing else. Field names follow its `jewelData`.
 */
export type ClusterJewelData = {
  /** "Small Cluster Jewel", "Medium Cluster Jewel" or "Large Cluster Jewel". */
  base: string;
  /** The small-passive enchant, as Path of Building's skill id. */
  skill?: string;
  nodeCount?: number;
  socketCount?: number;
  /** A unique that states its socket count outright ("Adds 2 Jewel Socket Passive Skills"). */
  socketCountOverride?: number;
  nothingnessCount?: number;
  smallsNothing?: boolean;
  notables: string[];
  /** A unique cluster that adds one keystone and nothing else. */
  keystone?: string;
  /** "Added Small Passive Skills also grant" lines, for the small passives' tooltips. */
  addedMods: string[];
  /** Path of Building's `clusterJewelValid`: whether it would build this cluster at all. */
  valid: boolean;
};

/** One expanded cluster as the game's endpoint lays it out. */
export type ClusterGraph = {
  /** The jewel slot the cluster sits in, which the tree's `jewelSlots` maps to a socket. */
  slot: number;
  /** The proxy node whose group the cluster is laid out on. */
  proxy: number;
  x: number;
  y: number;
  nodes: {
    key: string;
    name: string;
    stats: string[];
    orbit: number;
    orbitIndex: number;
    kind: "Keystone" | "Notable" | "Jewel" | "Normal" | "Mastery";
    links: string[];
  }[];
};

/** The named passives an allocation holds, which a node count alone loses. */
export type PassiveDetail = {
  /** "alternate" for a Path of Exile 1 event tree, such as Legacy of Phrecia. */
  variant?: string;
  keystones: string[];
  notables: string[];
  ascendancyNotables: string[];
  bloodlineNodes: string[];
  masteries: { name: string; effect: string }[];
  tattoos: string[];
};

export type BuildData = {
  source: "pob" | "manual" | "poe-api";
  pobVersion?: string;
  className?: string;
  ascendClassName?: string;
  level?: number;
  bandit?: string;
  mainSkill?: string;
  stats: Record<string, number>;
  minionStats?: Record<string, number>;
  skillGroups: SkillGroup[];
  items: ParsedItem[];
  slots: Record<string, number>;
  trees: TreeSpec[];
  activeTree: number;
  /** Item ids socketed into the active passive tree. */
  treeJewels?: number[];
  /** Named passives, from a source that lists them. */
  passives?: PassiveDetail;
  /** Where an imported character came from, and when it was read. */
  origin?: { account: string; realm: string; lastLogin?: string; fetchedAt?: string };
  notes?: string;
  config: { name: string; value: string }[];
};

export type Character = {
  id: number;
  userId: number;
  leagueId: number;
  slug: string;
  name: string;
  className: string;
  ascendancy: string | null;
  level: number | null;
  /** The owner's own words for the build: prose, not a gem name. */
  mainSkill: string | null;
  /**
   * The exact name of the skill the character was built around, spelled as the
   * game spells it. Separate from `mainSkill` because that field holds the
   * record's prose ("golemancer corrupting fever exsanguinate"), which names a
   * build rather than a skill and so cannot resolve to a gem or its art.
   */
  skillGem: string | null;
  /**
   * How the league was played — Hardcore, SSF, Ruthless, Trade — as canonical
   * ids. A league is one catalogue row but runs as several parallel variants,
   * and which one a character played is a fact about the character.
   */
  leagueModifiers: LeagueModifierId[];
  notes: string | null;
  /** In-game /played time in minutes, entered by hand — no export carries it. */
  playedMinutes: number | null;
  isFavorite: number;
  pobCode: string | null;
  pobUrl: string | null;
  retiredAt: string | null;
  createdAt: string;
  data: BuildData;
};
