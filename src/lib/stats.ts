export type StatFormat = "int" | "big" | "pct" | "pct2" | "dec2" | "multi" | "rate" | "sec";
export type StatTone = "life" | "mana" | "es" | "gold" | "danger" | "plain";

export type StatDef = {
  key: string;
  label: string;
  format: StatFormat;
  tone?: StatTone;
};

export type StatPanel = {
  title: string;
  stats: StatDef[];
};

export function formatNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 100_000) return `${Math.round(value / 1_000)}k`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (abs >= 100) return Math.round(value).toLocaleString("en-US");
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return value.toFixed(2);
}

export function formatStat(value: number, format: StatFormat): string {
  switch (format) {
    case "big":
      return formatNumber(value);
    case "pct":
      return `${Math.round(value)}%`;
    case "pct2":
      return `${value.toFixed(2)}%`;
    case "dec2":
      return value.toFixed(2);
    case "multi":
      // PoB stores crit multiplier either as a multiplier (3.5) or a percent (350).
      return value < 20 ? `${value.toFixed(2)}x` : `${Math.round(value)}%`;
    case "rate":
      return `${formatNumber(value)}/s`;
    case "sec":
      return `${value.toFixed(2)}s`;
    case "int":
    default:
      return Math.round(value).toLocaleString("en-US");
  }
}

export const OFFENCE_PANELS: StatPanel[] = [
  {
    title: "Damage",
    stats: [
      { key: "FullDPS", label: "Full DPS", format: "big", tone: "gold" },
      { key: "CombinedDPS", label: "Combined DPS", format: "big", tone: "gold" },
      { key: "TotalDPS", label: "Skill DPS", format: "big" },
      { key: "TotalDot", label: "Damage over time", format: "big" },
      { key: "WithPoisonDPS", label: "DPS with poison", format: "big" },
      { key: "WithIgniteDPS", label: "DPS with ignite", format: "big" },
      { key: "WithBleedDPS", label: "DPS with bleed", format: "big" },
      { key: "CullingDPS", label: "DPS with culling", format: "big" },
      { key: "AverageDamage", label: "Average hit", format: "big" },
      { key: "AverageHit", label: "Average hit", format: "big" },
    ],
  },
  {
    title: "Delivery",
    stats: [
      { key: "Speed", label: "Attacks / casts per sec", format: "dec2" },
      { key: "HitSpeed", label: "Hit rate", format: "dec2" },
      { key: "TrapThrowingTime", label: "Trap throw time", format: "sec" },
      { key: "MineLayingTime", label: "Mine throw time", format: "sec" },
      { key: "SkillCooldown", label: "Cooldown", format: "sec" },
      { key: "HitChance", label: "Chance to hit", format: "pct" },
      { key: "CritChance", label: "Crit chance", format: "pct2" },
      { key: "CritMultiplier", label: "Crit multiplier", format: "multi" },
      { key: "EffectiveCritChance", label: "Effective crit chance", format: "pct2" },
    ],
  },
  {
    title: "Cost",
    stats: [
      { key: "ManaCost", label: "Mana cost", format: "int", tone: "mana" },
      { key: "LifeCost", label: "Life cost", format: "int", tone: "life" },
      { key: "ESCost", label: "Energy shield cost", format: "int", tone: "es" },
      { key: "RageCost", label: "Rage cost", format: "int" },
      { key: "ManaPercentCost", label: "Mana cost (%)", format: "pct", tone: "mana" },
    ],
  },
];

export const DEFENCE_PANELS: StatPanel[] = [
  {
    title: "Pools",
    stats: [
      { key: "Life", label: "Life", format: "int", tone: "life" },
      { key: "LifeUnreserved", label: "Life unreserved", format: "int", tone: "life" },
      { key: "LifeRegenRecovery", label: "Life regen", format: "rate", tone: "life" },
      { key: "LifeLeechGainRate", label: "Life leech", format: "rate", tone: "life" },
      { key: "EnergyShield", label: "Energy shield", format: "int", tone: "es" },
      { key: "EnergyShieldRegenRecovery", label: "ES regen", format: "rate", tone: "es" },
      { key: "Ward", label: "Ward", format: "int", tone: "es" },
      { key: "Mana", label: "Mana", format: "int", tone: "mana" },
      { key: "ManaUnreserved", label: "Mana unreserved", format: "int", tone: "mana" },
      { key: "ManaRegenRecovery", label: "Mana regen", format: "rate", tone: "mana" },
      { key: "Rage", label: "Rage", format: "int" },
    ],
  },
  {
    title: "Mitigation",
    stats: [
      { key: "Armour", label: "Armour", format: "int" },
      { key: "PhysicalDamageReduction", label: "Phys. damage reduction", format: "pct" },
      { key: "Evasion", label: "Evasion", format: "int" },
      { key: "MeleeEvadeChance", label: "Evade chance", format: "pct" },
      { key: "BlockChance", label: "Block", format: "pct" },
      { key: "SpellBlockChance", label: "Spell block", format: "pct" },
      { key: "SpellSuppressionChance", label: "Spell suppression", format: "pct" },
      { key: "AttackDodgeChance", label: "Attack dodge", format: "pct" },
      { key: "SpellDodgeChance", label: "Spell dodge", format: "pct" },
    ],
  },
  {
    title: "Effective hit pool",
    stats: [
      { key: "TotalEHP", label: "Effective hit pool", format: "big", tone: "gold" },
      { key: "PhysicalMaximumHitTaken", label: "Phys. max hit", format: "big" },
      { key: "FireMaximumHitTaken", label: "Fire max hit", format: "big" },
      { key: "ColdMaximumHitTaken", label: "Cold max hit", format: "big" },
      { key: "LightningMaximumHitTaken", label: "Lightning max hit", format: "big" },
      { key: "ChaosMaximumHitTaken", label: "Chaos max hit", format: "big" },
    ],
  },
];

export const ATTRIBUTE_STATS: StatDef[] = [
  { key: "Str", label: "Strength", format: "int" },
  { key: "Dex", label: "Dexterity", format: "int" },
  { key: "Int", label: "Intelligence", format: "int" },
];

export const CHARGE_STATS: StatDef[] = [
  { key: "PowerChargesMax", label: "Power charges", format: "int" },
  { key: "FrenzyChargesMax", label: "Frenzy charges", format: "int" },
  { key: "EnduranceChargesMax", label: "Endurance charges", format: "int" },
];

export const RESISTANCES: { key: string; label: string; tone: string }[] = [
  { key: "FireResist", label: "Fire", tone: "text-res-fire" },
  { key: "ColdResist", label: "Cold", tone: "text-res-cold" },
  { key: "LightningResist", label: "Lightning", tone: "text-res-lightning" },
  { key: "ChaosResist", label: "Chaos", tone: "text-res-chaos" },
];

export type ResolvedStat = { key: string; label: string; text: string; tone: StatTone };

/** Keep only the stats a build actually reports, in the order the panel defines. */
export function resolvePanel(stats: Record<string, number>, defs: StatDef[]): ResolvedStat[] {
  const seen = new Set<string>();
  const out: ResolvedStat[] = [];
  for (const def of defs) {
    const value = stats[def.key];
    if (value === undefined || value === 0 || seen.has(def.label)) continue;
    seen.add(def.label);
    out.push({ key: def.key, label: def.label, text: formatStat(value, def.format), tone: def.tone ?? "plain" });
  }
  return out;
}

export function resolvePanels(stats: Record<string, number>, panels: StatPanel[]) {
  return panels
    .map((panel) => ({ title: panel.title, rows: resolvePanel(stats, panel.stats) }))
    .filter((panel) => panel.rows.length > 0);
}

/** Human-readable fallback label for stats not in the curated panels. */
export function humanizeStatKey(key: string): string {
  return key
    .replace(/^Spec:/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bDPS\b/i, "DPS")
    .replace(/^./, (character) => character.toUpperCase());
}
