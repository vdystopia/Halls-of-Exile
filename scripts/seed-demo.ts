/**
 * Seeds a browsable demo archive: two players, several leagues, and characters
 * imported through the real Path of Building pipeline (XML -> deflate -> base64
 * -> parser), so the demo data exercises the same code path as a real import.
 *
 *   npm run seed:demo          # add demo players if they are missing
 *   npm run seed:demo -- --reset   # wipe users/characters first
 */
import zlib from "node:zlib";
import { db } from "../src/lib/db";
import { parsePlayed } from "../src/lib/format";
import { parsePob } from "../src/lib/pob";

type ItemSpec = { slot: string; text: string };
type GemSpec = { name: string; level?: number; quality?: number; support?: boolean };
type GroupSpec = { slot: string; label?: string; gems: GemSpec[] };

type BuildSpec = {
  username: string;
  patch: string;
  name: string;
  level: number;
  className: string;
  ascendancy: string;
  bandit?: string;
  mainSocketGroup?: number;
  favorite?: boolean;
  memories?: string;
  played?: string;
  stats: Record<string, number>;
  groups: GroupSpec[];
  items: ItemSpec[];
  treeNodes: number;
  treeUrl: string;
  treeVersion: string;
  notes?: string;
  config?: Record<string, string | number | boolean>;
};

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function toXml(spec: BuildSpec): string {
  const stats = Object.entries(spec.stats)
    .map(([stat, value]) => `    <PlayerStat stat="${stat}" value="${value}"/>`)
    .join("\n");

  const skills = spec.groups
    .map((group, index) => {
      const gems = group.gems
        .map((gem) => {
          const skillId = gem.support ? `Support${gem.name.replace(/\W/g, "")}` : gem.name.replace(/\W/g, "");
          return `        <Gem enabled="true" nameSpec="${escapeXml(gem.name)}" skillId="${skillId}" level="${gem.level ?? 20}" quality="${gem.quality ?? 0}" count="1"/>`;
        })
        .join("\n");
      return `      <Skill enabled="true" slot="${group.slot}" mainActiveSkill="1" label="${escapeXml(group.label ?? "")}" id="${index + 1}">
${gems}
      </Skill>`;
    })
    .join("\n");

  const items = spec.items
    .map((item, index) => `    <Item id="${index + 1}">\n${escapeXml(item.text.trim())}\n    </Item>`)
    .join("\n");
  const slots = spec.items
    .map((item, index) => `      <Slot name="${item.slot}" itemId="${index + 1}"/>`)
    .join("\n");

  const config = Object.entries(spec.config ?? {})
    .map(([name, value]) => {
      const attribute =
        typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string";
      return `    <Input name="${name}" ${attribute}="${value}"/>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="${spec.level}" targetVersion="3_0" className="${spec.className}" ascendClassName="${spec.ascendancy}" bandit="${spec.bandit ?? "None"}" mainSocketGroup="${spec.mainSocketGroup ?? 1}" viewMode="TREE">
${stats}
  </Build>
  <Skills activeSkillSet="1" sortGemsByDPS="true">
    <SkillSet id="1" title="Default">
${skills}
    </SkillSet>
  </Skills>
  <Tree activeSpec="1">
    <Spec title="Default" treeVersion="${spec.treeVersion}" nodes="${Array.from({ length: spec.treeNodes }, (_, index) => 10000 + index).join(",")}" masteryEffects="{1,2},{3,4}">
      <URL>${spec.treeUrl}</URL>
    </Spec>
  </Tree>
  <Items activeItemSet="1">
${items}
    <ItemSet id="1">
${slots}
    </ItemSet>
  </Items>
  <Notes>${escapeXml(spec.notes ?? "")}</Notes>
  <Config>
${config}
  </Config>
</PathOfBuilding>`;
}

function encode(xml: string): string {
  return zlib.deflateSync(Buffer.from(xml, "utf8")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-");
}

const PLAYERS = [
  {
    username: "zizaran",
    firstName: "Ziz",
    tagline: "Ten years of exile, one Righteous Fire character per league.",
  },
  {
    username: "quinnsplains",
    firstName: "Quinn",
    tagline: "Only plays the meta three weeks after everyone else has quit.",
  },
];

const LEAGUE_RECORDS: { username: string; patch: string; completed: number; notes?: string }[] = [
  { username: "zizaran", patch: "3.13", completed: 40, notes: "The best league ever made. 40/40 in nine days." },
  { username: "zizaran", patch: "3.21", completed: 36, notes: "Crucible weapons carried a bad league." },
  { username: "zizaran", patch: "3.25", completed: 40, notes: "Kingsmarch made the grind bearable. 40/40 again." },
  { username: "zizaran", patch: "3.5", completed: 24, notes: "Betrayal board reworked twice before I understood it." },
  { username: "quinnsplains", patch: "3.25", completed: 18, notes: "Stopped playing after the third act of gold sinks." },
  { username: "quinnsplains", patch: "3.23", completed: 32, notes: "Wildwood charms were the most fun I have had in years." },
];

const BUILDS: BuildSpec[] = [
  {
    username: "zizaran",
    patch: "3.13",
    name: "RitualOfTheAncestor",
    level: 96,
    className: "Duelist",
    ascendancy: "Slayer",
    bandit: "Alira",
    favorite: true,
    memories: "First character to ever kill Sirus at awakening 8. Died to the meteor twice before it clicked.",
    played: "9d 4h",
    stats: {
      Life: 5482,
      LifeUnreserved: 3702,
      LifeRegenRecovery: 412.6,
      LifeLeechGainRate: 1370.5,
      EnergyShield: 412,
      Mana: 1204,
      ManaUnreserved: 214,
      Armour: 28450,
      PhysicalDamageReduction: 47,
      Evasion: 9840,
      MeleeEvadeChance: 32,
      BlockChance: 40,
      SpellBlockChance: 22,
      FireResist: 76,
      FireResistOverCap: 41,
      ColdResist: 75,
      ColdResistOverCap: 38,
      LightningResist: 78,
      LightningResistOverCap: 52,
      ChaosResist: -14,
      Str: 312,
      Dex: 204,
      Int: 155,
      TotalEHP: 41240,
      PhysicalMaximumHitTaken: 12480,
      FireMaximumHitTaken: 9840,
      ColdMaximumHitTaken: 9720,
      LightningMaximumHitTaken: 10450,
      ChaosMaximumHitTaken: 5120,
      FullDPS: 4128000,
      CombinedDPS: 3980500,
      TotalDPS: 3980500,
      AverageDamage: 612400,
      Speed: 6.5,
      CritChance: 68.4,
      CritMultiplier: 4.12,
      HitChance: 100,
      ManaCost: 24,
      EnduranceChargesMax: 4,
      FrenzyChargesMax: 5,
    },
    groups: [
      {
        slot: "Body Armour",
        gems: [
          { name: "Cyclone", level: 21, quality: 23 },
          { name: "Infused Channelling Support", level: 20, quality: 20, support: true },
          { name: "Impale Support", level: 20, quality: 20, support: true },
          { name: "Melee Physical Damage Support", level: 21, quality: 20, support: true },
          { name: "Pulverise Support", level: 20, quality: 20, support: true },
          { name: "Fortify Support", level: 20, quality: 20, support: true },
        ],
      },
      {
        slot: "Helmet",
        gems: [
          { name: "Pride", level: 21 },
          { name: "Blood and Sand", level: 20 },
          { name: "Flesh and Stone", level: 20 },
          { name: "Enlighten Support", level: 4, support: true },
        ],
      },
      {
        slot: "Boots",
        gems: [
          { name: "Leap Slam", level: 20, quality: 20 },
          { name: "Faster Attacks Support", level: 20, support: true },
          { name: "Endurance Charge on Melee Stun Support", level: 20, support: true },
          { name: "Blood Rage", level: 20 },
        ],
      },
    ],
    items: [
      {
        slot: "Weapon 1",
        text: `Rarity: RARE
Havoc Beak
Vaal Axe
Item Level: 84
Quality: 20
Sockets: R-R-R
LevelReq: 64
Implicits: 0
205% increased Physical Damage
Adds 24 to 41 Physical Damage
+189 to Accuracy Rating
28% increased Attack Speed
+38% to Global Critical Strike Multiplier
{crafted}+2 to Melee Strike Range`,
      },
      {
        slot: "Body Armour",
        text: `Rarity: UNIQUE
Kaom's Heart
Glorious Plate
Unique ID: 3bd1c1f5
Item Level: 84
LevelReq: 68
Implicits: 0
Has no Sockets
+500 to maximum Life
40% increased Fire Damage
Corrupted`,
      },
      {
        slot: "Helmet",
        text: `Rarity: RARE
Corpse Halo
Eternal Burgonet
Item Level: 85
Quality: 20
Sockets: R-R-R-B
LevelReq: 69
Implicits: 1
{crafted}+1 to Level of Socketed Aura Gems
+112 to maximum Life
+48% to Fire Resistance
+41% to Cold Resistance
Nearby Enemies have -9% to Physical Damage Reduction
{crafted}12% increased Armour`,
      },
      {
        slot: "Gloves",
        text: `Rarity: RARE
Rage Grip
Titan Gauntlets
Item Level: 84
Quality: 20
Sockets: R-R-R-R
LevelReq: 68
Implicits: 1
+22 to Strength
+98 to maximum Life
25% increased Attack Speed
+44% to Lightning Resistance
Adds 9 to 17 Physical Damage to Attacks`,
      },
      {
        slot: "Boots",
        text: `Rarity: RARE
Golem Stride
Titan Greaves
Item Level: 84
Quality: 20
Sockets: R-R-B-R
LevelReq: 68
Implicits: 1
+28 to Strength
+124 to maximum Life
35% increased Movement Speed
+41% to Cold Resistance
+38% to Lightning Resistance`,
      },
      {
        slot: "Belt",
        text: `Rarity: RARE
Behemoth Buckle
Stygian Vise
Item Level: 84
LevelReq: 68
Implicits: 1
Has 1 Abyssal Socket
+114 to maximum Life
+42% to Fire Resistance
16% increased Armour
{crafted}+1 to Maximum Endurance Charges`,
      },
      {
        slot: "Amulet",
        text: `Rarity: RARE
Onslaught Locket
Marble Amulet
Item Level: 84
Quality: 20
LevelReq: 52
Implicits: 1
Regenerate 1.2% of Life per second
+82 to maximum Life
+38 to Strength
+35% to Global Critical Strike Multiplier
Adds 5 to 9 Physical Damage to Attacks`,
      },
      {
        slot: "Ring 1",
        text: `Rarity: RARE
Vengeance Turn
Steel Ring
Item Level: 84
LevelReq: 80
Implicits: 1
Adds 12 to 18 Physical Damage to Attacks
+74 to maximum Life
+44% to Fire Resistance
+38% to Cold Resistance
Adds 7 to 13 Physical Damage to Attacks`,
      },
      {
        slot: "Ring 2",
        text: `Rarity: UNIQUE
Circle of Guilt
Iron Ring
Unique ID: 71ab9021
Item Level: 84
LevelReq: 12
Implicits: 1
{range:0.7}Adds (6-8) to (9-12) Physical Damage to Attacks
{range:0.8}+(20-30) to maximum Energy Shield
{range:0.6}(15-25)% increased Fire Damage`,
      },
      {
        slot: "Flask 1",
        text: `Rarity: MAGIC
Seething Divine Life Flask of Staunching
Item Level: 68
Quality: 20
LevelReq: 60
Implicits: 0
Instant Recovery
Immunity to Bleeding during Effect`,
      },
      {
        slot: "Flask 2",
        text: `Rarity: UNIQUE
Lion's Roar
Granite Flask
Unique ID: bc41ff90
Item Level: 75
Quality: 20
LevelReq: 27
Implicits: 1
+3000 to Armour during Effect
{range:0.5}(75-100)% increased Melee Physical Damage during Effect
Knocks Back Enemies in an Area when you use a Flask`,
      },
    ],
    treeNodes: 118,
    treeVersion: "3_13",
    treeUrl: "https://www.pathofexile.com/passive-skill-tree/3.13.0/AAAABgMBAA",
    notes: "Standard Ritual-era Slayer Cyclone. Impale stacking, Pride, and a lot of armour.",
    config: { enemyIsBoss: "Pinnacle", conditionEnemyMaimed: true, multiplierEnduranceCharge: 4 },
  },
  {
    username: "zizaran",
    patch: "3.25",
    name: "KalguurBurns",
    level: 98,
    className: "Marauder",
    ascendancy: "Chieftain",
    bandit: "Alira",
    favorite: true,
    memories: "Ran the entire Settlers league on this one. Kingsmarch paid for every upgrade.",
    played: "14d 11h",
    stats: {
      Life: 7412,
      LifeUnreserved: 4218,
      LifeRegenRecovery: 1840.2,
      EnergyShield: 620,
      Mana: 890,
      ManaUnreserved: 152,
      Armour: 51200,
      PhysicalDamageReduction: 61,
      Evasion: 4120,
      BlockChance: 32,
      SpellSuppressionChance: 100,
      FireResist: 78,
      FireResistOverCap: 84,
      ColdResist: 76,
      ColdResistOverCap: 44,
      LightningResist: 76,
      LightningResistOverCap: 39,
      ChaosResist: 41,
      Str: 428,
      Dex: 121,
      Int: 188,
      TotalEHP: 88400,
      PhysicalMaximumHitTaken: 22400,
      FireMaximumHitTaken: 19800,
      ColdMaximumHitTaken: 17600,
      LightningMaximumHitTaken: 17100,
      ChaosMaximumHitTaken: 12400,
      FullDPS: 2840000,
      CombinedDPS: 2840000,
      TotalDot: 1980000,
      AverageDamage: 0,
      Speed: 0,
      EnduranceChargesMax: 5,
    },
    groups: [
      {
        slot: "Body Armour",
        gems: [
          { name: "Righteous Fire", level: 21, quality: 20 },
          { name: "Elemental Focus Support", level: 21, quality: 20, support: true },
          { name: "Burning Damage Support", level: 21, quality: 20, support: true },
          { name: "Efficacy Support", level: 21, quality: 20, support: true },
          { name: "Swift Affliction Support", level: 21, quality: 20, support: true },
          { name: "Empower Support", level: 4, support: true },
        ],
      },
      {
        slot: "Helmet",
        gems: [
          { name: "Determination", level: 21 },
          { name: "Purity of Fire", level: 21 },
          { name: "Zealotry", level: 21 },
          { name: "Enlighten Support", level: 4, support: true },
        ],
      },
      {
        slot: "Gloves",
        gems: [
          { name: "Fire Trap", level: 20, quality: 20 },
          { name: "Combustion Support", level: 20, support: true },
          { name: "Cruelty Support", level: 20, support: true },
          { name: "Swift Assembly Support", level: 20, support: true },
        ],
      },
    ],
    items: [
      {
        slot: "Weapon 1",
        text: `Rarity: RARE
Sorrow Song
Void Sceptre
Item Level: 86
Quality: 20
Sockets: R-R-B
LevelReq: 68
Implicits: 1
40% increased Elemental Damage
+1 to Level of all Fire Spell Skill Gems
118% increased Fire Damage
+92 to maximum Life
{crafted}Damage Penetrates 12% Fire Resistance`,
      },
      {
        slot: "Weapon 2",
        text: `Rarity: RARE
Doom Ward
Titanium Spirit Shield
Item Level: 86
Quality: 20
Sockets: B-B
LevelReq: 68
Implicits: 1
16% increased Spell Damage
+108 to maximum Life
+96 to maximum Energy Shield
+45% to Fire Resistance
{crafted}+1% to Maximum Fire Resistance`,
      },
      {
        slot: "Body Armour",
        text: `Rarity: RARE
Rapture Shell
Astral Plate
Item Level: 86
Quality: 20
Sockets: R-R-R-R-R-B
LevelReq: 62
Implicits: 1
+12% to all Elemental Resistances
+142 to maximum Life
132% increased Armour
+38% to Fire Resistance
{crafted}+1% to Maximum Fire Resistance
{fractured}10% reduced Elemental Damage taken`,
      },
      {
        slot: "Helmet",
        text: `Rarity: RARE
Blight Crown
Praetor Crown
Item Level: 86
Quality: 20
Sockets: R-B-B-B
LevelReq: 68
Implicits: 1
{crafted}+2 to Level of Socketed Aura Gems
+128 to maximum Life
+44% to Cold Resistance
+42% to Lightning Resistance
Regenerate 2.4% of Life per second`,
      },
      {
        slot: "Gloves",
        text: `Rarity: RARE
Doom Clasp
Zealot Gauntlets
Item Level: 84
Quality: 20
Sockets: R-R-B-B
LevelReq: 57
Implicits: 1
+118 to maximum Life
+36% to Fire Resistance
+41% to Chaos Resistance
14% increased Armour
{crafted}Regenerate 1% of Life per second`,
      },
      {
        slot: "Boots",
        text: `Rarity: RARE
Dread Trail
Titan Greaves
Item Level: 86
Quality: 20
Sockets: R-R-R-B
LevelReq: 68
Implicits: 1
+132 to maximum Life
35% increased Movement Speed
+45% to Cold Resistance
Regenerate 1.8% of Life per second
{crafted}12% increased Armour`,
      },
      {
        slot: "Belt",
        text: `Rarity: UNIQUE
Mageblood
Heavy Belt
Unique ID: 55ee2210
Item Level: 86
LevelReq: 68
Implicits: 1
+35 to Strength
{range:0.5}(30-40)% increased Flask Effect Duration
Your 4 highest-value Utility Flasks are always active
Utility Flasks cannot be used`,
      },
      {
        slot: "Amulet",
        text: `Rarity: RARE
Empyrean Choker
Amber Amulet
Item Level: 86
Quality: 20
LevelReq: 60
Implicits: 1
+38 to Strength
+92 to maximum Life
+18% to all Elemental Resistances
Regenerate 1.4% of Life per second
{crafted}+1% to Maximum Fire Resistance`,
      },
      {
        slot: "Ring 1",
        text: `Rarity: UNIQUE
Emberwake
Ruby Ring
Unique ID: 4410fedc
Item Level: 84
LevelReq: 36
Implicits: 1
{range:0.5}+(20-30)% to Fire Resistance
{range:0.6}(15-25)% increased Fire Damage
Your Ignites do not Deal Damage over Time
Corrupted`,
      },
      {
        slot: "Ring 2",
        text: `Rarity: RARE
Vengeance Coil
Amethyst Ring
Item Level: 86
LevelReq: 80
Implicits: 1
+22% to Chaos Resistance
+88 to maximum Life
+41% to Fire Resistance
+38% to Lightning Resistance
{crafted}Regenerate 0.8% of Life per second`,
      },
      {
        slot: "Flask 1",
        text: `Rarity: UNIQUE
Rumi's Concoction
Granite Flask
Unique ID: aa11bb22
Item Level: 75
Quality: 20
LevelReq: 27
Implicits: 1
{range:0.5}(12-16)% additional Chance to Block during Effect
{range:0.5}(6-8)% additional Chance to Block Spells during Effect`,
      },
    ],
    treeNodes: 123,
    treeVersion: "3_25",
    treeUrl: "https://www.pathofexile.com/passive-skill-tree/3.25.0/AAAABgMBAB",
    notes: "Chieftain RF. Max fire res, huge regen, Mageblood keeps the flasks up forever.",
    config: { enemyIsBoss: "Pinnacle", multiplierEnduranceCharge: 5, conditionOnConsecratedGround: true },
  },
  {
    username: "quinnsplains",
    patch: "3.23",
    name: "WildwoodRain",
    level: 94,
    className: "Ranger",
    ascendancy: "Pathfinder",
    bandit: "Kill all",
    memories: "Wildwood charms made this thing absurd. Deleted it the second the league ended anyway.",
    played: "6d 2h",
    stats: {
      Life: 4820,
      LifeUnreserved: 3120,
      LifeRegenRecovery: 284.5,
      EnergyShield: 1840,
      Mana: 1120,
      ManaUnreserved: 288,
      Evasion: 32400,
      MeleeEvadeChance: 71,
      SpellSuppressionChance: 100,
      Armour: 3200,
      FireResist: 76,
      FireResistOverCap: 22,
      ColdResist: 75,
      ColdResistOverCap: 18,
      LightningResist: 75,
      LightningResistOverCap: 24,
      ChaosResist: 12,
      Str: 148,
      Dex: 452,
      Int: 202,
      TotalEHP: 34800,
      PhysicalMaximumHitTaken: 8900,
      FireMaximumHitTaken: 8200,
      FullDPS: 5620000,
      CombinedDPS: 5620000,
      TotalDot: 4980000,
      WithPoisonDPS: 5620000,
      AverageDamage: 148000,
      Speed: 5.85,
      CritChance: 12.4,
      CritMultiplier: 2.1,
      HitChance: 96,
      ManaCost: 18,
      FrenzyChargesMax: 6,
    },
    groups: [
      {
        slot: "Body Armour",
        gems: [
          { name: "Toxic Rain", level: 21, quality: 20 },
          { name: "Vicious Projectiles Support", level: 21, quality: 20, support: true },
          { name: "Mirage Archer Support", level: 20, quality: 20, support: true },
          { name: "Void Manipulation Support", level: 20, quality: 20, support: true },
          { name: "Empower Support", level: 4, support: true },
          { name: "Efficacy Support", level: 20, quality: 20, support: true },
        ],
      },
      {
        slot: "Helmet",
        gems: [
          { name: "Grace", level: 21 },
          { name: "Malevolence", level: 21 },
          { name: "Enlighten Support", level: 4, support: true },
        ],
      },
      {
        slot: "Gloves",
        gems: [
          { name: "Withering Step", level: 20 },
          { name: "Blink Arrow", level: 20 },
          { name: "Faster Attacks Support", level: 20, support: true },
        ],
      },
    ],
    items: [
      {
        slot: "Weapon 1",
        text: `Rarity: RARE
Death Barb
Spine Bow
Item Level: 86
Quality: 20
Sockets: G-G-G-G-G-B
LevelReq: 64
Implicits: 0
+2 to Level of Socketed Bow Gems
158% increased Physical Damage
Adds 12 to 24 Chaos Damage
28% increased Attack Speed
{crafted}+1 to Level of Socketed Support Gems`,
      },
      {
        slot: "Body Armour",
        text: `Rarity: RARE
Phantom Guard
Zodiac Leather
Item Level: 86
Quality: 20
Sockets: G-G-G-G-B-B
LevelReq: 62
Implicits: 0
+118 to maximum Life
+96 to maximum Energy Shield
158% increased Evasion Rating
+41% to Cold Resistance
{fractured}+9% chance to Suppress Spell Damage`,
      },
      {
        slot: "Helmet",
        text: `Rarity: RARE
Vengeance Veil
Lion Pelt
Item Level: 86
Quality: 20
Sockets: G-B-B-G
LevelReq: 65
Implicits: 0
{crafted}+2 to Level of Socketed Aura Gems
+112 to maximum Life
+82 to maximum Energy Shield
+44% to Lightning Resistance
+7% chance to Suppress Spell Damage`,
      },
      {
        slot: "Gloves",
        text: `Rarity: UNIQUE
Asenath's Gentle Touch
Silk Gloves
Unique ID: 1298fa4b
Item Level: 84
Quality: 20
Sockets: G-B-G
LevelReq: 45
Implicits: 0
{range:0.5}+(20-30) to Dexterity
{range:0.5}+(20-30) to Intelligence
{range:0.6}(30-40)% increased Damage over Time
Enemies you Kill are Shattered
Enemies you kill Explode, dealing 5% of their Life as Physical Damage`,
      },
      {
        slot: "Boots",
        text: `Rarity: RARE
Storm Stride
Slink Boots
Item Level: 86
Quality: 20
Sockets: G-G-B-G
LevelReq: 69
Implicits: 0
+108 to maximum Life
30% increased Movement Speed
+42% to Fire Resistance
+38% to Chaos Resistance
{crafted}10% chance to Suppress Spell Damage`,
      },
      {
        slot: "Belt",
        text: `Rarity: RARE
Hypnotic Bind
Stygian Vise
Item Level: 86
LevelReq: 68
Implicits: 1
Has 1 Abyssal Socket
+124 to maximum Life
+45% to Cold Resistance
+38% to Fire Resistance
24% increased Flask Effect Duration`,
      },
      {
        slot: "Amulet",
        text: `Rarity: RARE
Vengeance Beads
Citrine Amulet
Item Level: 86
Quality: 20
LevelReq: 68
Implicits: 1
+28 to Strength and Dexterity
+82 to maximum Life
+38 to Dexterity
32% increased Damage over Time
{crafted}+12% to Chaos Damage over Time Multiplier`,
      },
      {
        slot: "Ring 1",
        text: `Rarity: RARE
Empyrean Loop
Two-Stone Ring
Item Level: 86
LevelReq: 68
Implicits: 1
+14% to Fire and Cold Resistances
+78 to maximum Life
+42% to Lightning Resistance
+34 to Dexterity
{crafted}Non-Channelling Skills have -8 to Total Mana Cost`,
      },
      {
        slot: "Ring 2",
        text: `Rarity: RARE
Corpse Grasp
Amethyst Ring
Item Level: 86
LevelReq: 80
Implicits: 1
+24% to Chaos Resistance
+84 to maximum Life
+40% to Cold Resistance
18% increased Damage over Time`,
      },
      {
        slot: "Flask 1",
        text: `Rarity: MAGIC
Experimenter's Quicksilver Flask of Adrenaline
Item Level: 68
Quality: 20
LevelReq: 40
Implicits: 0
25% increased Movement Speed during Effect`,
      },
    ],
    treeNodes: 115,
    treeVersion: "3_23",
    treeUrl: "https://www.pathofexile.com/passive-skill-tree/3.23.0/AAAABgMBAC",
    notes: "Pathfinder Toxic Rain. Flask uptime, evasion, suppression cap.",
    config: { enemyIsBoss: "Pinnacle", multiplierFrenzyCharge: 6 },
  },
];

const MANUAL_CHARACTERS = [
  {
    username: "zizaran",
    patch: "3.5",
    name: "SyndicateSpite",
    className: "Templar",
    ascendancy: "Inquisitor",
    level: 89,
    mainSkill: "Winter Orb",
    played: "7d 18h",
    memories:
      "No build export survives from this one — only the memory of farming Aisling every night for a T1 suffix.",
    stats: { Life: 4210, EnergyShield: 1180, FullDPS: 820000 },
  },
  {
    username: "quinnsplains",
    patch: "3.25",
    name: "GoldMineOfKalguur",
    className: "Witch",
    ascendancy: "Necromancer",
    level: 92,
    mainSkill: "Skeleton Mages",
    played: "11d 6h",
    memories: "Mostly used to run Kingsmarch. Barely mapped, still hit level 92 somehow.",
    stats: { Life: 5120, EnergyShield: 2400, FullDPS: 1450000 },
  },
];

function main() {
  const reset = process.argv.includes("--reset");
  if (reset) {
    db.exec("DELETE FROM characters; DELETE FROM league_records; DELETE FROM users;");
    console.log("cleared existing users, league records and characters");
  }

  const insertUser = db.prepare(
    `INSERT INTO users (username, first_name, tagline) VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET first_name = excluded.first_name, tagline = excluded.tagline`,
  );
  for (const player of PLAYERS) insertUser.run(player.username, player.firstName, player.tagline);

  const userId = (username: string) =>
    (db.prepare(`SELECT id FROM users WHERE username = ?`).get(username) as { id: number }).id;
  const leagueId = (patch: string) => {
    const row = db.prepare(`SELECT id FROM leagues WHERE patch = ?`).get(patch) as { id: number } | undefined;
    if (!row) throw new Error(`Unknown league patch ${patch}`);
    return row.id;
  };

  const insertRecord = db.prepare(
    `INSERT INTO league_records (user_id, league_id, challenges_completed, notes) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, league_id) DO UPDATE SET
       challenges_completed = excluded.challenges_completed, notes = excluded.notes`,
  );
  for (const record of LEAGUE_RECORDS) {
    insertRecord.run(userId(record.username), leagueId(record.patch), record.completed, record.notes ?? null);
  }

  const insertCharacter = db.prepare(
    `INSERT INTO characters
       (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill, notes, played_minutes,
        is_favorite, pob_code, pob_url, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, league_id, slug) DO UPDATE SET
       name = excluded.name, class_name = excluded.class_name, ascendancy = excluded.ascendancy,
       level = excluded.level, main_skill = excluded.main_skill, notes = excluded.notes,
       played_minutes = excluded.played_minutes,
       is_favorite = excluded.is_favorite, pob_code = excluded.pob_code, data = excluded.data`,
  );

  for (const spec of BUILDS) {
    const code = encode(toXml(spec));
    const data = parsePob(code);
    insertCharacter.run(
      userId(spec.username),
      leagueId(spec.patch),
      slugify(spec.name),
      spec.name,
      spec.className,
      spec.ascendancy,
      spec.level,
      data.mainSkill ?? null,
      spec.memories ?? null,
      parsePlayed(spec.played ?? ""),
      spec.favorite ? 1 : 0,
      code,
      null,
      JSON.stringify(data),
    );
    console.log(
      `imported ${spec.name} (${spec.patch}) — ${data.items.length} items, ${data.skillGroups.length} gem groups, ${Object.keys(data.stats).length} stats`,
    );
  }

  for (const manual of MANUAL_CHARACTERS) {
    const data = {
      source: "manual" as const,
      className: manual.className,
      ascendClassName: manual.ascendancy,
      level: manual.level,
      mainSkill: manual.mainSkill,
      stats: manual.stats,
      skillGroups: [],
      items: [],
      slots: {},
      trees: [],
      activeTree: 0,
      config: [],
    };
    insertCharacter.run(
      userId(manual.username),
      leagueId(manual.patch),
      slugify(manual.name),
      manual.name,
      manual.className,
      manual.ascendancy,
      manual.level,
      manual.mainSkill,
      manual.memories,
      parsePlayed(manual.played ?? ""),
      0,
      null,
      null,
      JSON.stringify(data),
    );
    console.log(`wrote ${manual.name} (${manual.patch}) by hand`);
  }

  console.log("demo archive ready — visit /players");
}

main();
