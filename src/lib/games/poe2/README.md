# Path of Exile 2

Everything specific to Path of Exile 2. Pages reach it only through the dispatch
modules in `src/lib/games/` (`gear.ts`, `builds.ts`, `exports.ts`, `skills.ts`,
`classes.ts`, `ascendancy.ts`), never directly; CLAUDE.md has the rules.

## Two sources for a build

- **A Path of Building 2 share code** is the whole build: passive tree (with
  weapon-set passives and attribute choices), skill gems, tree jewels, gear,
  config and computed stats. `pob.ts` reads the `<PathOfBuilding2>` envelope and
  `pob-items.ts` the item text, whose vocabulary differs from Path of Exile 1's:
  `Spirit:` and `Rune:` header keys, `Sockets: S` counting rune sockets,
  `{enchant}`, `{rune}` and `{desecrated}` tags, and `"nil"` for false. Only the
  active tree, item set, skill set and config set are kept — the version that was
  active when the code was saved. The tree version is the `<Spec treeVersion>`;
  `<Build targetVersion>` is `0_1` on every save and means nothing.
- **The pathofexile2.com account export** (`site-export.ts`), saved by the
  browser snippet in `tools/poe2-char-export/`. The site serves gear only: no
  tree, no skill-slot gems. A code outranks it (`composePoe2Build`); the export
  stays underneath as the record of the game's own figures and last login.

## What is here

- `classes.ts` — the eight classes and their ascendancies, and the site's
  ascendancy ids (`Monk3` is Acolyte of Chayula).
- `gems.ts`, `gem-art-index.json`, `skill-names.json` — from `npm run gems:poe2`,
  repoe-fork's export at `repoe-fork.github.io/poe2/`. Every released gem has a
  picture and colour, including ones no longer dropped (Discipline), default
  attacks (Bow Shot) and templated ones indexed by id ("Companion: {0}"); the
  skill field offers only current gems. Art is WebP, downloaded by
  `npm run art:fetch` into `public/items/poe2/`.
- `item-art.ts`, `item-art-index.json` — base and unique pictures, from
  `npm run art:poe2`. A rare is found by its base, never its random name.
- `items.ts`, `tooltip.ts`, `stats.ts` — the paper doll (two flasks, three
  charms), a tooltip that derives nothing, and stat panels with Spirit and
  Deflection.
- `tree.ts`, `tree-data/`, `tree-versions.json`, and `public/trees/poe2/` —
  every tree Path of Building 2 ships (0.1 to 0.5), from `npm run tree:poe2`,
  checked against the game's own positions and each against a real code.
  `treeAscendancy` maps Abyssal Lich onto the Lich passives it spends.
- `ascendancy.ts`, `ascendancy-portraits.json` — portraits from poe2wiki.net.
- `scripts/data/poe2-trees/` — the site's own passive tree, one gzipped copy per
  change (`npm run tree:poe2:snapshot`), used as the positional check.
