// Synthetic fixtures shaped like live pathofexile.com responses (Sept 2026 probe).
const classes = [
  ['Scion', [['Ascendant', 'Ascendant'], ['Reliquarian', 'Reliquarian'], ['Luminary', 'Luminary']]],
  ['Marauder', [['Juggernaut', 'Juggernaut'], ['Berserker', 'Berserker'], ['Chieftain', 'Chieftain']]],
  ['Ranger', [['Raider', 'Warden'], ['Deadeye', 'Deadeye'], ['Pathfinder', 'Pathfinder']]],
  ['Witch', [['Occultist', 'Occultist'], ['Elementalist', 'Elementalist'], ['Necromancer', 'Necromancer']]],
  ['Duelist', [['Slayer', 'Slayer'], ['Gladiator', 'Gladiator'], ['Champion', 'Champion']]],
  ['Templar', [['Inquisitor', 'Inquisitor'], ['Hierophant', 'Hierophant'], ['Guardian', 'Guardian']]],
  ['Shadow', [['Assassin', 'Assassin'], ['Trickster', 'Trickster'], ['Saboteur', 'Saboteur']]],
];
const altNames = { Elementalist: 'Herald', Occultist: 'Harbinger', Necromancer: 'Bog Shaman' };
function tree(alternate) {
  return {
    tree: alternate ? 'DefaultAltAscendancies' : 'Default',
    classes: classes.map(([name, ascs]) => ({ name, ascendancies: ascs.map(([id, n]) => ({ id, name: alternate ? (altNames[id] || n + ' Alt') : n })) })),
    alternate_ascendancies: [{ id: 'Warden', name: 'Warden of the Maji' }, { id: 'Warlock', name: 'Warlock of the Mists' }],
    nodes: {
      root: { out: [] },
      '100': { skill: 100, name: 'Strength', stats: ['+10 to Strength'] },
      '200': { skill: 200, name: 'Chaos Inoculation', isKeystone: true, stats: ['Maximum Life becomes 1, Immune to Chaos Damage'] },
      '300': { skill: 300, name: 'Heart of Oak', isNotable: true, stats: ['20% increased maximum Life'] },
      '400': { skill: 400, name: 'Life Mastery', isMastery: true, masteryEffects: [{ effect: 4001, stats: ['+50 to maximum Life'] }, { effect: 4002, stats: ['Regenerate 1% of Life per second'] }] },
      '500': { skill: 500, name: 'Jewel Socket', isJewelSocket: true, stats: [] },
      '600': { skill: 600, name: alternate ? 'Storm Herald Alt' : 'Shaper of Flames', isNotable: true, ascendancyName: 'Elementalist', stats: ['All damage can Ignite'] },
      '700': { skill: 700, name: 'Maji Bloodline', isNotable: true, isBloodline: true, ascendancyName: 'Warden', stats: ['Bloodline stat'] },
      '800': { skill: 800, name: 'Tattooable Small', stats: ['+10 to Dexterity'] },
      '900': { skill: 900, name: 'Unwise', isNotable: true, stats: ['8% increased [Critical|Critical Strike] Chance'] },
    },
    jewelSlots: [500, 61666],
    points: { totalPoints: 123, ascendancyPoints: 8 },
  };
}
const TAGS = { 'Righteous Fire': 'Spell, AoE, Fire, Duration', 'Herald of Ash': 'Spell, AoE, Fire, Herald', 'Summon Stone Golem': 'Minion, Spell, Golem, Physical', 'Cleave': 'Attack, Melee, AoE', 'Molten Shell': 'Spell, AoE, Duration, Fire, Physical, Guard' };
const gem = (name, socket, level, quality, support, colour) => ({ typeLine: name, baseType: name, frameType: 4, support, colour, socket, corrupted: false,
  properties: [{ name: support ? 'Support' : (TAGS[name] || 'Spell'), values: [], displayMode: 0 }, { name: 'Level', values: [[`${level}${level === 20 ? ' (Max)' : ''}`, 0]], displayMode: 0 }, { name: 'Quality', values: [[`+${quality}%`, 1]], displayMode: 0 }] });
function items(name, league) {
  return {
    items: [
      { inventoryId: 'BodyArmour', x: 0, y: 0, w: 2, h: 3, id: 'a1', name: '<<set:MS>><<set:M>><<set:S>>Doom Shell', typeLine: 'Astral Plate', baseType: 'Astral Plate', rarity: 'Rare', frameType: 2, ilvl: 86, identified: true, league,
        influences: { shaper: true }, fractured: true,
        properties: [{ name: 'Armour', values: [['1200', 1]], displayMode: 0 }], requirements: [{ name: 'Level', values: [['62', 0]], displayMode: 0 }],
        implicitMods: ['+12% to all Elemental Resistances'], explicitMods: [{ description: '+100 to maximum [Life|Life]' }, '30% increased Armour', { description: '+40 to Strength', flags: { fractured: true } }, { description: '+1 to Level of Socketed Gems', flags: { crafted: true } }],
        sockets: [0, 0, 0, 0, 0, 1].map((g, i) => ({ group: g, attr: 'S', sColour: i === 5 ? 'G' : 'R' })),
        socketedItems: [gem('Righteous Fire', 0, 21, 20, false, 'S'), gem('Burning Damage Support', 1, 20, 20, true, 'S'), gem('Elemental Focus Support', 2, 20, 0, true, 'S'),
          gem('Concentrated Effect Support', 3, 20, 20, true, 'S'), gem('Efficacy Support', 4, 20, 20, true, 'S'), gem('Herald of Ash', 5, 20, 0, false, 'D')] },
      { inventoryId: 'Helm', x: 0, y: 0, w: 2, h: 2, id: 'h1', name: 'Foulborn The Baron', typeLine: 'Close Helmet', baseType: 'Close Helmet', rarity: 'Unique', frameType: 3, ilvl: 26, identified: true, mutated: true, league,
        explicitMods: [{ description: '+2 to Level of Socketed Minion Gems' }], mutatedMods: ['Foulborn mod'], sockets: [{ group: 0, attr: 'S', sColour: 'R' }, { group: 0, attr: 'S', sColour: 'R' }],
        socketedItems: [gem('Summon Stone Golem', 0, 20, 0, false, 'S'), gem('Maim Support', 1, 20, 0, true, 'S')] },
      { inventoryId: 'Weapon2', x: 0, y: 0, w: 1, h: 4, id: 'w2', name: '', typeLine: 'Jewelled Foil', baseType: 'Jewelled Foil', rarity: 'Normal', frameType: 0, ilvl: 70, league,
        sockets: [0, 0, 0].map((g) => ({ group: g, attr: 'G', sColour: 'G' })), socketedItems: [gem('Cleave', 0, 1, 0, false, 'S'), gem('Added Fire Damage Support', 1, 1, 0, true, 'S'), gem('Onslaught Support', 2, 1, 0, true, 'S')].map((g) => g) },
      { inventoryId: 'Boots', x: 0, y: 0, w: 2, h: 2, id: 'b1', name: 'Grim Stride', typeLine: 'Two-Toned Boots', baseType: 'Two-Toned Boots', rarity: 'Rare', frameType: 2, ilvl: 84, league,
        sockets: [0, 0, 0, 0].map((g) => ({ group: g, attr: 'S', sColour: 'R' })),
        socketedItems: [gem('Molten Shell', 0, 20, 0, false, 'S'), gem('Cast when Damage Taken Support', 1, 20, 0, true, 'S'), gem('More Duration Support', 2, 20, 0, true, 'S'), gem('Increased Duration Support', 3, 20, 0, true, 'S')] },
      { inventoryId: 'Flask', x: 2, y: 0, w: 1, h: 2, id: 'f3', name: '', typeLine: 'Quicksilver Flask of Adrenaline', baseType: 'Quicksilver Flask', rarity: 'Magic', frameType: 1, ilvl: 60, league, utilityMods: ['40% increased Movement Speed during Effect'] },
      { inventoryId: 'MainInventory', x: 0, y: 0, w: 1, h: 1, id: 'c1', typeLine: 'Chaos Orb', baseType: 'Chaos Orb', frameType: 5, stackSize: 3, league },
    ],
    character: { name, realm: 'pc', class: 'x', league, level: 90, lastLoginTime: 1769970279 },
    inventory: { gold: 29086 },
  };
}
function passives(kind) {
  const base = { character: 3, ascendancy: 2, alternate_ascendancy: 0, hashes: [900, 100, 200, 300, 400, 500, 600, 800], hashes_ex: [], mastery_effects: { '400': 4002 }, skill_overrides: {}, items: [], jewel_data: {} };
  if (kind === 'cluster') {
    base.hashes_ex = [157, 158, 159];
    base.jewel_data = { '1': { type: 'JewelPassiveTreeExpansionLarge', subgraph: { groups: {}, nodes: { '157': { skill: 157, name: 'Prismatic Heart', isNotable: true, stats: ['+15% to all Elemental Resistances'] }, '158': { skill: 158, name: 'Small Cluster', stats: ['10% increased Fire Damage'] }, '159': { skill: 159, isJewelSocket: true, stats: [] } } } } };
    base.items = [{ inventoryId: 'PassiveJewels', x: 0, y: 0, w: 1, h: 1, name: 'Watcher\'s Eye', typeLine: 'Prismatic Jewel', baseType: 'Prismatic Jewel', rarity: 'Unique', frameType: 3, explicitMods: ['4% increased maximum Life'] },
      { inventoryId: 'PassiveJewels', x: 1, y: 0, w: 1, h: 1, name: '', typeLine: 'Large Cluster Jewel', baseType: 'Large Cluster Jewel', rarity: 'Magic', frameType: 1, enchantMods: ['Added Small Passive Skills grant: 12% increased Fire Damage'] }];
    base.skill_overrides = { '800': { name: 'Loyalty Tattoo of Hinekora', stats: ['+15 to Dexterity'] } };
    base.alternate_ascendancy = 1;
    base.character = 2; base.ascendancy = 1;
  }
  if (kind === 'unascended') { base.ascendancy = 0; base.hashes = [100, 300]; base.mastery_effects = {}; base.character = 0; }
  return base;
}
const characters = [
  { name: 'RFChief', realm: 'pc', class: 'Elementalist', league: 'Standard', level: 95, lastLoginTime: 1737303632, pinnable: true },
  { name: 'BEVSTCHEESE', realm: 'pc', class: 'Herald', league: 'Phrecia 2.0', level: 90, lastLoginTime: 1769970279, pinnable: true },
  { name: 'ClusterWarden', realm: 'pc', class: 'Warden', league: 'SSF Ruthless', level: 88, lastLoginTime: 1784567333, pinnable: true },
  { name: 'freshscion', realm: 'pc', class: 'Scion', league: 'Solo Self-Found', level: 12, lastLoginTime: 1700000000, pinnable: false },
];
module.exports = { tree, items, passives, characters };
