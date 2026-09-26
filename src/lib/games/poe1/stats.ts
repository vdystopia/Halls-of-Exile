import type { StatDef, StatPanel } from "../shared/stats";

// Formatting and resolving are shared by both games, and re-exported for this
// game's own modules.
export {
  formatNumber,
  formatStat,
  humanizeStatKey,
  resolvePanel,
  resolvePanels,
  type ResolvedStat,
  type StatDef,
  type StatFormat,
  type StatPanel,
  type StatTone,
} from "../shared/stats";

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
