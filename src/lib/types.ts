export type User = {
  id: number;
  username: string;
  firstName: string;
  createdAt: string;
};

export type League = {
  id: number;
  patch: string;
  name: string;
  expansion: string | null;
  startDate: string | null;
  endDate: string | null;
  /** 1 when endDate is a projection rather than an announced date. */
  endDateEstimated: number;
  challengeTotal: number;
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
  sockets: SocketGroupColor[][];
  influences: string[];
  flags: string[];
  implicits: string[];
  explicits: string[];
  raw: string;
};

export type Gem = {
  name: string;
  level: number | null;
  quality: number | null;
  enabled: boolean;
  support: boolean;
  count?: number;
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
};

export type BuildData = {
  source: "pob" | "manual";
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
  mainSkill: string | null;
  notes: string | null;
  isFavorite: number;
  pobCode: string | null;
  pobUrl: string | null;
  retiredAt: string | null;
  createdAt: string;
  data: BuildData;
};
