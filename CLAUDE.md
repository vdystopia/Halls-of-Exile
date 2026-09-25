# Halls of Exile — working notes

An archive of a Path of Exile player's entire back catalogue of characters, organised by
league. Self-hosted; runs on the owner's Windows home server in Docker. See `README.md`
for what it does and how it deploys.

## Commands

```bash
npm run dev          # dev server on :3001 (prod container uses :3000)
npm test             # node --test via tsx — parser and catalogue invariants
npm run lint         # eslint
npx tsc --noEmit     # typecheck
npm run build        # production build (also what CI and Docker run)
npm run seed:demo    # demo players; -- --reset wipes users/characters first
npm run seed:atlas   # the owner's own record, 99 characters, into ./data; -- --reset re-imports
```

`.\collect.ps1` on the owner's PC fills in the gear of archived characters that do not have
any yet: it reads each player's account out of the running archive, runs the collector in
`tools/poe-char-export/` against it, and posts the result to `/api/import/poe`. It never
rewrites a character that already holds a build and never creates one — see the first rule
below — so a second run writes nothing, which is what makes it safe to schedule.

**Do not hand the owner commands to run. Run them.** The merge to Main, the push, the checks —
all of that works from anywhere and is the assistant's job. Only two things need the owner's own
machine, because the archive lives behind their network with no port forwarded and no SSH
exposed (deliberately), so nothing outside can reach in: `update.ps1`, which drives their Docker,
and `collect.ps1`, which must read Path of Exile from a residential address.

There are two ways to make even those unattended, and the first is much better:

1. **Run the session on that box.** Claude Code installs natively on Windows, no WSL:
   `irm https://claude.ai/install.ps1 | iex`, then `cd X:\halls; claude`. A session started
   there can run `update.ps1` and `collect.ps1` directly as tool calls — nothing to poll, nothing
   to install beyond Claude Code itself, and the whole loop closes. Git for Windows is worth
   having so the Bash tool works; without it the shell tool is PowerShell, which is fine here.
2. **`.\watch.ps1 -Install`**, run once, for when no session is open. It registers two scheduled
   tasks: one checks every few minutes whether Main has moved and its build is green and runs
   `update.ps1` if so, the other runs `collect.ps1` daily. Useful when the assistant is working
   from a sandbox, and for the daily collection either way.

Deploy is `.\update.ps1` on the owner's PC, never a bare `docker compose up -d --build`:
it backs up, pulls, rebuilds, health-checks, rolls back on failure, and holds a lock so two
runs cannot race. **Item art is baked into the image** (`COPY /app/public`), so `npm run
art:fetch` has to run *before* the deploy, not after — fetching afterwards leaves the
container serving the art it was built with. The script counts the images against the
catalogue and warns when they are behind.

## Shape of the code

```
src/app/                      routes; every data page is force-dynamic
src/app/api/health/route.ts   health probe (Docker healthcheck + CI + update.ps1 all use it)
src/app/api/players/route.ts  players and their accounts, so collect.ps1 holds no config
src/app/api/import/poe/route.ts  unattended ingest for collect.ps1
src/components/               UI; forms are client components, everything else is server
src/lib/db.ts                 connection, schema, migrations, league catalogue sync
src/lib/leagues.ts            the league catalogue itself
src/lib/games/index.ts        the game registry; GameModule is in games/types.ts
src/lib/games/poe1/           everything Path of Exile 1 specific: pob, poe-api, items,
                              stats, tooltip, item art, gem colours, ascendancy emblems
src/lib/games/poe2/           Path of Exile 2: classes, gems, the site-export mapper,
                              paper doll and tooltip; see its README
src/lib/games/exports.ts      reads either game's account export and picks its mapper
src/lib/games/gear.ts         per-game paper doll, item art, tooltip and gem colour
src/lib/queries.ts            reads
src/lib/actions.ts            writes — server actions only
src/lib/import.ts             applying an account export, shared by the upload
                              page and the unattended endpoint
tests/                        node:test files
tools/poe-char-export/        the collector: reads an account off the game's own
                              character endpoints and writes the JSON the import
                              page takes. Vendored as handed over, not built or
                              linted here.
tools/poe2-char-export/       the Path of Exile 2 equivalent: a browser snippet
                              run on the logged-in pathofexile2.com characters page
```

Data flow: a PoB share code is base64+deflate over XML. `parsePob` turns it into a
`BuildData`, which is stored as JSON in `characters.data` alongside the original code,
so a character page never depends on an external link staying alive. A whole account
read off the game's own endpoints takes the same path through `buildFromPoeExport`,
and its payload is stored in `characters.source_payload` for the same reason.

## Rules that must hold

- **An archived character is finished. Nothing automatic may ever change one.** This is the
  point of the whole project, and it outranks every convenience below it. A character page
  records what a character *was*; the live account records what it *is*, and for anything but
  the current league those differ by however much gear has been stripped off it since — the
  build was dismantled for the next one, the gems were pulled, the tree was respecced. An
  automated refresh would replace a finished record with an empty shell, and the only copy of
  the original is the one it just destroyed. So `applyImport` fills a character that holds no
  build and refuses one that does; `overwrite` is per character and the unattended caller has
  none; the upload page leaves an archived row unticked and labelled, so replacing one is a
  deliberate act by name. New characters arrive periodically and are added; old ones are never
  touched again without being asked for. `tests/import.test.ts` pins this down.
  The one thing that does rewrite a stored build is `reparseStaleBuilds`, and only from the
  source already captured on the row — it re-renders facts the archive already holds through
  fixed code, and fetches nothing. If even that is unwanted, it is the thing to change.
- **The league catalogue is code-owned.** Rows with `is_custom = 0` are re-synced from
  `LEAGUE_SEED` on every boot, so editing a built-in league in the database is pointless.
  User-added leagues (`is_custom = 1`) are never touched by the sync. A row dropped from the
  seed is deleted on the next boot unless a character or league record is filed under it, so a
  stale catalogue row cannot outlive the code that created it. Every seed row carries
  its `game`, and the key is `(game, slug)`. The key widened twice: `patch` broke when Path of
  Exile 2 arrived, since both games ship a 1.0, and `(game, patch)` broke when events arrived,
  since three of them run inside 3.25 alone. Display order comes from the start date at sync
  time, not from the seed file's order, so an event sorts beside the league it ran inside.
- **Path of Exile 2's catalogue is sourced, and its gaps are marked.** Grinding Gear Games
  publish no machine-readable league list, so the 0.1–0.5.5 dates came from secondary sources
  and one of them (0.3's start) had to be settled between conflicting reports. A row whose
  dates are unconfirmed or unknown sets `datesUncertain`, and `challengeTotal` is `null` for
  every Path of Exile 2 league — there were no challenges before 0.5 and 0.5's count is not
  recorded anywhere found. Do not fill either in from memory.
- **Path of Exile 2 leagues gap and overlap; Path of Exile 1's never did.** 0.4 ends four
  days before 0.5 starts, and 0.5.5 runs beside 0.5 rather than after it, so the
  hand-over-without-a-gap invariant is enforced for Path of Exile 1 only.
- **A Path of Exile 2 league and its content update have different names**, exactly as a
  Path of Exile 1 league and its expansion do: `name` is the league (Fate of the Vaal, Rise
  of the Abyssal, Runes of Aldur), `expansion` is the update (The Last of the Druids, The
  Third Edict, Return of the Ancients).
- **Every new column needs a migration.** SQLite has no `ADD COLUMN IF NOT EXISTS`, and
  live archives exist. Add the column to `SCHEMA` *and* to the `additions` list in
  `migrate()` in `src/lib/db.ts`. Verify against a copy of a populated pre-change database.
- **Only a game's newest league may carry `endDateEstimated`.** A test enforces this. When a
  real end date is announced, replace the estimate and clear the flag.
- **A league closes a few days before the next one opens.** This catalogue used to set each
  end date to the next league's start, and a test enforced that hand-over. The owner's own
  record shows it is wrong: every Path of Exile 1 league closes three or four days early. The
  invariant is now "in order and never overlapping". The thirteen windows the owner's record
  covers are corrected; the rest still carry the old convention and are the ones to distrust.
- **URLs are `/players/<user>/<game>/<league>/<character>`.** The league segment is its slug,
  not its patch: both games have an "unspecified" league and a patch does not identify a row.
  `getLeague(game, slug)` is the only lookup; there is no patch-keyed one.
- **"Unspecified league" is Path of Exile 1 only, and closed.** The twenty-three characters
  whose league the owner's record does not name are all Path of Exile 1, and no more are
  coming — a new character arrives with its league. A second such row would put two
  identically-titled leagues in one list.
- **The owner's own record is `scripts/data/character-atlas.json`**, imported by
  `npm run seed:atlas`. 99 characters across two players, most predating any Path of Building
  export, so they carry name, level, class, ascendancy, build, playtime and notes and nothing
  else. Missing values read "Unknown" rather than blank. A re-run updates in place by player,
  league and name — **except one that has since been given a real build, which it skips
  untouched**: the build this file writes has no items in it, so the re-run path would otherwise
  destroy the gear of every imported character and leave an empty shell, and "just run
  seed:atlas again" is the first thing anyone reaches for. `tests/atlas.test.ts` fails if that
  guard goes. `--reset` deletes only rows that file would create, so a character added by
  hand is never caught in it. **The deployed archive is on a Docker volume, not in `./data`, so
  running the importer on the host only ever fills the development database.** Against the real
  archive it runs inside the container — `docker compose exec halls node scripts/seed-atlas.mjs`
  — which is why it is plain JavaScript and is copied into the image beside `backup.mjs`. The record is also the source that corrected thirteen league
  windows — it is first-hand and outranks any secondary source.
- **One format for a league or event everywhere**, from `leagueTitle`: patch, name, then the
  expansion for a league or the parent league for an event **in brackets** — `3.26 Mercenaries
  of Trarthus (Secrets of the Atlas)`, `3.25 Legacy of Phrecia (Settlers of Kalguur)`. Without
  the brackets the two names run together into one four-word title and nothing says where the
  league stops and the thing it ran inside begins. An event never shows an expansion, and a
  missing patch reads `###` — which now only ever happens for "Unspecified league", and a test
  pins that. `leagueLabel` is the same thing without the patch, for the league index, which
  gives the patch a column of its own.
- **The league index sorts and filters in the browser.** `LeagueIndex` is a client component
  because three multi-selects and a sort direction are not worth a round trip or a URL that has
  to carry them. Game, patch and league each sort and each filter; ticking nothing means "all",
  and the options are built from the rows actually present so a filter can never offer a value
  that empties the table. Two things that are easy to get wrong and are pinned by tests:
  patches sort as **version numbers** (`3.9` before `3.16`, which string order reverses), and
  the sort direction is passed *into* the comparators rather than negating them, so a row with
  no patch or no known dates stays at the bottom either way round instead of floating to the
  top on the second click. Ties fall back to the start date — three events share 3.25 and both
  closed beta rounds are 0.0. Sorting the League column sorts by date, not by name: the
  catalogue's own order is chronological so an event sits beside the league it ran inside, and
  alphabetical order would break exactly that. Characters, best level and challenges sort too.
- **Challenges sort as a fraction, never as a count.** A league's challenge total has been 8,
  12, 32 and 40 over the years, so the raw number finished says more about which league it was
  than about how far anyone got: 7 of 8 is the better run and has to rank above 20 of 40.
  `challengeFraction` in `format.ts` is what both the bar and the sort read, so the two cannot
  disagree about what finished looks like. A league with no challenges, or one whose count was
  never recorded, has no fraction and sorts last rather than reading as zero — a genuine nil out
  of forty is a result and ranks above them. A tie goes to the bigger league, separating 40/40
  from 8/8.
- **`ChallengeMeter` drops its own label inside the index.** The word "Challenges" beside the
  count needs about 160px, and in a narrower column the two were pushed apart until the count
  sat outside the table. The column header already says it, so `label={false}` there; the meter
  also carries `min-w-0`, without which a flex child refuses to shrink below its content and
  overflows rather than fitting. A league with **no challenges keeps the meter's shape**: "No
  Challenges" where the count goes and a bar of dark stone (`.challenge-stone-bar`) where the
  progress goes, so the column's rhythm doesn't break. **Every challenge done is radiant**:
  a white-hot band sweeps across the count and the bar on one 3.2s clock, the bar breathes a
  glow, and a ✦ twinkles beside the count. It's all in `globals.css` under `.challenge-radiant-*`,
  and still under `prefers-reduced-motion`. The track carries the glow on itself because the
  normal track's `overflow-hidden` would clip it. League index headers are 13px, and the Game
  and Characters columns were widened in both header and rows to fit them; measure `scrollWidth`
  against the cell if a label changes.
- **Migrations must survive a hot reload.** The connection is cached on globalThis so it
  outlives dev-server reloads, so `connection()` re-runs `migrate()` and the catalogue sync
  once per module evaluation. Without that, pulling a schema change left a running dev
  server erroring with "no such column" until it was restarted.
- **Nothing may open the database at import time.** `src/lib/db.ts` exports a proxy that
  connects on first use. `next build` imports every route module across one worker per core;
  connecting eagerly raced on the WAL lock and failed the build on machines with enough
  cores. `tests/db.test.ts` fails if importing the query layer creates the file.
- **Every game's own code lives in `src/lib/games/<game>/`, behind `GameModule`.** The registry
  in `src/lib/games/index.ts` hands a page or component the module for a game; nothing outside
  that folder branches on which game it is. Path of Exile and Path of Exile 2 share a vocabulary
  and almost no mechanics, and the subtlest logic here — the implicit boundary, a shield's block,
  attribute scaling — is exactly where one game's rules would silently corrupt the other's
  characters. `PARSER_VERSION` is per game for the same reason.
- **Item art is optional and resolved on the server.** `src/lib/games/poe1/item-art-index.json` is
  generated from RePoE by `npm run art:index`; `findItemArt` **and `buildTooltip`** run in
  `GearGrid` (a server component) so the 223 KB index never reaches the browser — `buildTooltip`
  reads the catalogue for block and requirements, and calling it from the client component shipped
  the whole thing to the browser for two weeks. `ItemTooltip` takes finished sections as a prop and
  `tests/client-bundle.test.ts` walks the client import graph to keep it that way. `GearSlot` falls back to the picture the
  game itself serves when the local one is missing — or outright when there is no local one,
  as for a Path of Exile 2 item the local index does not know — and to a silhouette when there is no remote
  one either — via a ref as well as `onError`, because the tag is server-rendered and a 404
  fires before React attaches the handler. Only an item read from the game's own endpoints names
  a remote picture, and that one is already composited, so a flask fetched that way is one frame
  rather than three. Do
  not import the index into a client component. The index holds `bases` keyed by base type
  and `uniques` keyed by the unique's own name: dozens of uniques share one base, so every
  Prismatic Jewel unique drew the same picture while art was keyed on the base alone. Only a
  unique is looked up by name — a rare's name is randomly generated and could collide. A few
  of RePoE's art paths are not what the CDN serves (Ancient Skull's 404s), so
  `src/lib/games/poe1/art-overrides.json` corrects them by name and the generator applies it last;
  editing the generated index by hand does not survive the next `npm run art:index`. Flask art is a three-frame sheet (glass, metal frame, liquid) that `GearSlot`
  composites with stacked background layers; every flask image is such a sheet and no other
  image is, checked across all 512.
- **An item's header region holds "Key: value" lines that are not mods** — league values like
  `Intangibility: 19%` and `Memory Strands: 41`, and `…BasePercentile` figures. A key the parser
  does not recognise falls through to the mod list, which shifts the `Implicits: N` boundary and
  pushes the item's real implicit into its explicits. Add unknown header keys to `META_KEYS` in
  `src/lib/items.ts` rather than letting them through.
- **Every item tooltip renders through `buildTooltip`** in `src/lib/tooltip.ts`, which fixes one
  order for all items — quality, anoint, defences, sockets, special, requires, implicit, enchant,
  explicit, footer, the order the game itself uses — and drops empty sections. Item level, base percentiles and the "Fractured
  Item" label are never shown. Add new lines to that module, not to the component.
- **A shield's block and an item's attribute requirements are derived, not parsed.** Path of
  Building computes them rather than writing them into the item text, so they come from the
  base's `block` and `req` in `item-art-index.json`: block is base x (1 + its own "increased
  Chance to Block" mods), floored, ignoring spell block; requirements take the level from the
  item and the attributes from the base, scaled by the item's own "reduced/increased Attribute
  Requirements" mods and floored. The requires section holds one line per figure ("Level 63",
  "130 Dex") so the tooltip can colour a scaled attribute without colouring the level beside it;
  scale with integer percentages rather than a multiplier, since 70 x 0.7 is 48.99999999999999.
- **The passive tree is drawn on the page, from a static SVG per version.** `npm run tree:svg`
  turns Grinding Gear Games' 6.7 MB `skilltree-export` `data.json` into `public/trees/<ver>.svg`
  — one `<circle id="n<skillid>">` per node at a resolved x/y, one `<line>` or `<path>` per
  connection with `id="c<a>-<b>"`, and nothing else. Node positions are polar in the source
  (`group.x/y` plus `constants.orbitRadii[orbit]` at an angle from `orbitIndex`), resolved once
  here so the browser never sees the maths or the file. The output is the **empty** tree, the
  same for every character who played that version, so it is one cacheable asset rather than a
  render each. It is committed, like the ascendancy portraits and for the same reason.
  **Allocation is a stylesheet, never a mutation**: every circle and line takes its colour from
  `currentColor`, so lighting a build is one `#n1234{color:…}` rule per allocated node, and a
  connection is lit only when both ends are. That is O(allocated) against a static three
  thousand element document. The SVG is loaded through an `<object>` on purpose — those
  elements have no business in React's reconciler or in the page's HTML — and the stylesheet
  **must be constructed in the SVG document's own window**: Chrome refuses to adopt one built
  by the parent, which took the whole page down the first time.
  **The tree panel is as wide as the window, not the page column.** On a 4K screen the 1400px
  column left it a postage stamp. It breaks out with symmetric negative margins
  (`mx-[calc(50%_-_50vw_+_1.25rem)]`), so it stays centred under the column and keeps the page's
  gutter. Never use a transform for this: a transformed ancestor becomes the containing block
  for the tooltip's `position: fixed` and throws it off the pointer. The tree is square, so width
  alone only adds empty sides; the box is as tall as the screen allows (`100svh - 8rem`), never
  taller than it is wide, and at least 420px.
- **A build is drawn on the tree it was made on.** Node ids are stable between versions but
  positions are not — about a third of an old build's nodes sit somewhere else on a current
  tree — so `treeAsset` matches `treeVersion` to a generated SVG. Only `3.29` is generated;
  adding one is `npm run tree:svg -- 3.25`, and the script finds the commit itself by reading
  the export repository's history, since that repo has two branches and marks versions by
  commit message. A version that has not been generated falls back to the newest and the page
  **says so** rather than drawing a wrong tree quietly. A build from the game's own endpoints
  carries no version at all and is drawn on the newest, which is exact: the API reports what a
  character has allocated today.
- **Passives are placed by one shared rule, `tree-geometry.ts`, and 16- and 40-slot orbits are
  uneven.** Since 3.17 the game puts a 16-slot orbit's passives at every 30 and 45 degrees and a
  40-slot orbit's at every 10 and 45 — Path of Building's `CalcOrbitAngles`, from the export's own
  README. The generator spaced every orbit evenly at first, which put 1,040 of the 3.29 tree's
  2,314 main nodes more than 5 units from the game's position and the worst 44.7 off; against
  pobb.in's independently generated tree the worst is now 1.4. The generator and the cluster
  layout both call `orbitAngle`/`orbitPoint`/`arcPath`, because a cluster's entry line has to land
  on its socket to the unit. A test pins four of the formerly worst nodes to pobb.in's coordinates.
- **Cluster jewels are drawn, by two routes that are tested against each other.** The empty tree
  cannot hold them — a cluster's passives, and the medium and small sockets inside it, exist only
  once a jewel is socketed — so a socket with an `expansionJewel.parent` is left out of the SVG,
  and `src/lib/games/poe1/clusters.ts` lays out each character's clusters at render time, server
  side; `PassiveTree` appends the finished circles and lines under the tree's own ids and classes
  so the allocation stylesheet lights them unchanged. `npm run tree:svg` also writes
  `tree-data/<ver>.json` (expansion sockets, proxy groups with their centres and node order,
  jewel slots, the groupless cluster notables) and the `index.ts` that imports each version
  statically so the standalone build contains them.
  - **The game's route** (`layoutFromGraphs`): the endpoint returns
    `raw.passives.jewel_data[slot].subgraph`, each expanded cluster already laid out in the main
    tree's schema, and `hashes_ex` naming its allocated passives; the mapper keeps both as
    `clusterGraphs`/`extendedNodes`. Its node keys are small local numbers and are moved clear of
    the tree's ids; its nested sockets are local nodes too, resolved to the real socket by the
    same index rule Path of Building uses (position matches it in 49 of 51 cases; the other two
    are a medium cluster in a large socket, where only the index rule is right).
  - **Path of Building's route** (`layoutFromJewels`) is a port of `PassiveSpecClass:BuildSubgraph`,
    with its tables from Path of Building's own `Data/ClusterJewels.lua` via
    `npm run clusters:index` (GitHub by default, `--from` for a local file). It has to reproduce
    the ids Path of Building *invents* for cluster passives — 0x10000 plus socket indices, size
    and template slot packed into the bits — or the stored allocation points at nothing.
  - **Both are verified against real data**: the port lays out the same jewels as the game for 16
    of 16 collected characters (250 cluster passives, every size, nesting, the medium-cluster
    exceptions) and regenerates all 304 cluster ids stored across the owner's 81 saved builds.
    `tests/clusters.test.ts` keeps five of those characters and two of those saves as fixtures.
  - **Old saves are converted, and more completely than Path of Building does.** A spec without
    `clusterHashFormatVersion` is format 1 (Path of Building's own default), from before it
    changed how nested sockets are chosen and clusters rotated. Its conversion maps old ids to new
    as it rebuilds, but in one pass that moves a jewel onto its new socket only after that
    socket's cluster would have been built — so its own load drops a cluster nested inside a
    converted socket, and the allocation with it. `convertLegacy` runs the same conversion to a
    fixed point instead, applying each cluster's mappings once; a test shows the nested Lone
    Messenger that Path of Building loses. Inside clusters the layout's allocation is
    authoritative (`drawnAllocation`), because an old id can now belong to a different passive.
  - Three details that each broke real data: a **magic** cluster jewel is one line with no base
    line, so the base is found inside the name (`clusterBase`); the game sends a **two-line
    enchant** as one mod with a newline in it, so lines are split before matching (six skills);
    and a nested socket is **named by what it accepts** — a medium cluster in a large socket
    borrows a medium socket's id but offers a small socket, as the game labels it.
  A mastery's tooltip shows **the effect the character chose, and only that one**. Both sources
  store the choice as mastery node → effect id (Path of Building's `masteryEffects`, the
  endpoint's `mastery_effects`), kept as `TreeSpec.masteryEffects`; the text comes from the tree
  data's `masteryEffects`, resolved server-side by `chosenMasteries`. The collector resolves the
  same choice itself and agrees in all 473 cases. The one that looked like a disagreement,
  VronDmon's Life Mastery reported as "Runegraft of Refraction", is the collector being right: a
  runegraft applied over an allocated mastery supersedes it, and the mastery's choice stays in
  the data underneath, inactive.
  **Runegrafts and tattoos replace what a node does, and the tree says so.** Both sources carry
  them — the endpoint's `skill_overrides` (`isMastery` marks a runegraft, `isTattoo` a tattoo),
  Path of Building's `<Overrides><Override nodeId dn>` with the stat lines as its text, kind
  told apart by the name starting "Runegraft" — kept as `TreeSpec.overrides`. The tooltip reads
  override, then chosen mastery effect, then the tree's own lines. An overridden node is drawn
  **fuchsia (`#d946ef`) for a runegraft, lime (`#a3e635`) for a tattoo**, and the footer carries
  a legend only for the kinds present. Only allocated nodes count: Path of Building keeps an
  override on a node after it is refunded (h3r4ld's save has a runegraft on an unallocated
  mastery), so the page filters to the allocation before the tree sees them. Jewel sockets have
  the same habit — a jewel left on a refunded socket, one item listed in several — which is why
  `parseTreeJewels` keeps allocated sockets only and each item once.
  Class start nodes are drawn for the opposite reason to nested sockets: every build allocates
  one, and leaving it out made every character report one phantom missing passive. A passive the
  tree still cannot place — an unreadable jewel, a notable a fallback tree version lacks — is
  counted in the footer rather than hidden.
- **A stored build is a cache of the parser, so parser fixes need `PARSER_VERSION`.**
  A character's items are parsed once, at import, and written to `characters.data` as JSON;
  the archive went on rendering base percentiles as mods for days after the parser stopped
  reading them that way. When a parser change makes older stored builds wrong, bump
  `PARSER_VERSION` in `src/lib/pob.ts`: `migrate()` re-parses every character whose
  `parser_version` is lower and that still has its share code. A character with no code, or
  one whose code no longer parses, keeps the build it has.
- **Ascendancy emblems are one sprite sheet, cropped in CSS.** Grinding Gear Games' own
  passive tree export (`grindinggear/skilltree-export`) ships all nineteen in a single image
  with per-class coordinates, which `npm run ascendancy:index` reduces to
  `src/lib/games/poe1/ascendancy-icons.json`; `npm run art:fetch` downloads the sheet itself to
  `public/ascendancy.webp`, which is not committed. Icons are indexed under both the id and
  the display name, because the two differ where a class was renamed (id `Raider`, name
  `Warden`) and which one an export carries depends on its Path of Building version. A
  character with no ascendancy renders no emblem rather than a placeholder.
- **The emblem and the class portrait are two pictures for two jobs.** The emblem above is
  composed with its lower half empty so the passive tree's lines can run through it, which is
  right on the tree and right at list size and mostly dead space at header size. So the
  character page header draws the wide class portrait instead, and `CharacterCard` keeps the
  emblem. Grinding Gear Games publish no index of the portraits, so `npm run ascendancy:art`
  resolves `File:<Ascendancy> ascendancy class.png` through the Path of Exile Wiki's MediaWiki
  API — never by guessing a URL — converts each to WebP and writes
  `src/lib/games/poe1/ascendancy-portraits.json` beside them. Which ascendancies to ask for
  comes from `ascendancy-icons.json`, so a new one is picked up by `npm run ascendancy:index`
  and this follows. **Unlike item art these are committed**, because a missing item picture is
  a silhouette in a grid of eighty and a missing portrait is a hole in the first thing on the
  page; the whole set is 432 KB and a test fails if any ascendancy lacks one. Raider and Warden
  share one file, the way they share one emblem.
  **Path of Exile 2's portraits come from its own wiki, and they are a different shape.** The
  same script resolves `File:<Ascendancy> portrait.png` on poe2wiki.net for every name in
  `poe2/classes.ts`, into `public/ascendancy/poe2/` and `src/lib/games/poe2/ascendancy-portraits.json`
  (23 files, 200 KB, also committed and tested). Each is a close crop of the face, 136–184px wide
  at about 1.3:1, not a 530x245 painting. So every index records each file's own size, and
  `AscendancyPortrait` takes a height (111px in the header) and derives the width; one box for
  both games would cut the forehead and chin off every Path of Exile 2 character. Path of Exile 2
  has no emblem sheet, so its card icon is the portrait's centre square. Deadeye and Pathfinder
  are names in both games and different classes in each, so art is looked up through
  `src/lib/games/ascendancy.ts` by game and never by name alone. The wiki's files are small, so
  the header portrait is slightly soft on a high-DPI screen.
  **A third picture, the avatar, is for the compact banner.** The player page's character lists
  (Most played, Level 100, Pinned & most recent) draw `CharacterBanner`, the character header compressed: at 96px the wide painting is mostly
  background, so it draws Path of Exile 1's `File:<Ascendancy> avatar.png` (135x105, a close crop
  of the face; `npm run ascendancy:art -- --game poe1-avatar`, into `public/ascendancy/avatar/` and
  `poe1/ascendancy-avatars.json`, committed and tested). Path of Exile 2's wiki redirects
  "avatar" to "portrait", so its portrait serves both. `ascendancyAvatar(game, name)` picks. `<Name>_official_art.jpg` exists
  there at full size if that ever matters, but it is full-body art and would need cropping.
- **Every league has a logo, and the header is bracketed by two pictures.** The character page
  header draws the portrait on the left and the league's logo on the right at one height
  (`PORTRAIT_HEIGHT`, 111px), so the two pictures share a top and a bottom edge; each one's width
  follows its own shape. `npm run leagues:art` fetches the logos from poewiki.net and
  poe2wiki.net into `public/leagues/` and writes `src/lib/league-logos.json`, keyed
  `game/slug`. **The choice of file is hand-made in the script (`PICKS`)**, because the wiki's
  names can't be derived and some are traps: "Domination league logo" is a screenshot, and
  Torment's, Talisman's and Legacy's are in-game art. The preference is the transparent
  544x394 "Path of Exile over the league's name" series, then the expansion's logo from that
  series, then the game's own logo marked `generic`. That last one covers 17 rows, mostly
  events, plus 1.0, Prophecy and the Path of Exile 2 betas and Early Access. Sacrifice of the
  Vaal and Forsaken Masters are real logos with baked-in backgrounds. Transparent margins
  are trimmed so the drawn art reaches the height it is given, and files are capped at 222px
  tall (1.2 MB for the set, committed). The wikis sit behind Cloudflare, which answers a burst
  with a challenge page, so the script batches titles fifty to a query, spaces its downloads,
  and reports a challenge as one. A new catalogue row fails `tests/league-logos.test.ts` until
  it has a logo.
- **The archive header's total /played is days to two places, then whole hours**:
  `245.88d (5901h)` from `formatPlayedTotal`. A character's own /played keeps `formatPlayed`.
  The stat columns are content-width (`sm:grid-cols-[repeat(4,auto)]`), so a wider figure
  pushes the others left instead of spreading all four.
- **A character is called by its ascendancy, or its class where it has none.** `classLine`
  returns one name, never two: an ascendancy already names its class, so "Occultist · Witch"
  says the same thing twice and spends the widest line on the page doing it. A character with
  no ascendancy is called by its class and nothing is said about the absence — under level 68
  there is nothing missing to remark on.
- **The character header's left side is name, level · class, and the skill — nothing else.**
  The skill shows only as a named gem with its picture, so record prose (`mainSkill`, "chaos
  dot") never gets a tag there; /played sits on the right under the league dates, and the bandit
  moved to the passive tree summary. The name is coloured by its class's starting attributes
  (`src/lib/games/class-colors.ts`, per game): str red, dex green, int blue — one attribute runs
  light to dark, a hybrid runs one colour into the other, Scion runs all three. `.gem-name` in
  `globals.css` puts a gem's gloss and facet over it. A class the map lacks keeps the gold. Path
  of Exile 2's attributes (Huntress dex, Druid int/str) come from memory, not a source.
- **The player page's metrics are computed in `src/lib/metrics.ts`, per game.** Classes roll up
  into ascendancies (characters, leagues, /played, average and highest level, 90+, most-built
  skill). Builds are grouped by skill and ranked two ways, by character count (the default) or
  by /played, each breaking ties with the other; `BuildRanking` only picks which
  server-rendered grid to show. Witch and Ranger are classes in both games and skills share
  names across them, so nothing is summed across games. A /played total covers only characters
  that have one, and the table marks a partial total with `*` and says how many it covers. The
  skill for grouping is `buildSkill`: the recorded gem, else the record's words when they are
  exactly a gem name, else the words as written; "Unknown" is not a skill. The class list is
  `<details>`, so it needs no client code. Every section of the page is a `Section` (also
  `<details>`) and starts closed. The league index opens when reached through its own show-all
  link, which lives in the section body because a click in a summary also toggles it.
- **How a league was played is a fact about the character, not the league.** Every league opens
  as several parallel leagues — Settlers, Hardcore Settlers, SSF Settlers — so the catalogue
  holds one row and `characters.league_modifiers` holds which of them a character played in, as
  a set, because Hardcore and SSF combine. `src/lib/league-modifiers.ts` owns the vocabulary and
  the canonical order, shared across both games because these are labels and no rule branches on
  them. **Nothing infers them.** The collector does record `league_flags` and grades them the
  way it grades the origin league, but the flags describe the league a character sits in *now*:
  migration rewrites exactly the fact in question, and a Hardcore character that died reports
  `hardcore: false`. Only a `certain` grade would be safe, and that covers only characters still
  in their original league. They are set by hand or not at all.
- **A gem's colour comes from an index, and no gem leads its group.** Path of Building's
  export does not carry a gem's attribute, so `src/lib/games/poe1/gem-colors.json` (from RePoE via
  `npm run gems:index`) maps metadata id and name to r/g/b/w; supports are indexed with and
  without the trailing "Support", and a transfigured gem resolves through its base gem's id.
  A socket group has no primary skill — four golems are four equal actives — so `orderGems`
  puts every active above every support and nothing is promoted to a title.
- **Gem art is a layered sheet, the way flask art is.** A gem's picture is a 143x48 strip
  holding the socket setting and the gem itself, meant to be stacked into one icon; drawn flat
  it reads as two smudges at the edges of the tile. `SkillIcon` composites it the way
  `GearSlot` composites a flask. The frame count is **measured** when `npm run gems:art` builds
  the index — a 24-byte range request per image for the PNG header — and not inferred from the
  path, because every support's art and two actives' (Quickstep, Hex Spreading) are plain
  squares, and stacking one of those draws it at triple zoom. `gem-art-index.json` is therefore
  `{ art, singleFrame }` rather than a flat map.
- **The skill field is the primary source for what a character was built around.** The add,
  edit and upload pages all offer `SkillSelect`: a native `<input list>` against one
  `<datalist>` of the 339 active skill gems, generated into
  `src/lib/games/poe1/skill-names.json` by `npm run gems:index` beside the colours, from the
  same snapshot. Supports are excluded — nobody built a character around Increased Area of
  Effect — and the list suggests without constraining, because RePoE does not publish
  transfigured gems and "Frostblink of Wintry Blast" has to be typeable. The list is read on
  the server and handed over as a prop, and `tests/client-bundle.test.ts` fails if `gems.ts` or
  the list reaches the browser. On the upload page every row carries the field, pre-filled with
  the archived skill where there is one and the exporter's guess where there is not, labelled
  `guessed` — the guess is the active gem with the most supports linked to it and is often
  wrong (it offers `Portal`). A skill chosen there is the one answer allowed to replace a
  recorded `skill_gem`. **The unattended caller passes no `skillFor`**, so `/api/import/poe`
  keeps the old order: fill a blank, never touch an answer. An empty field is not a request to
  clear one.
- **Path of Exile 2 characters come from the logged-in site, and it serves gear only.**
  pathofexile2.com has no public profile; `/internal-api/my-account/characters?realm=poe2` and
  `/character/<id>?realm=poe2` need the session cookie *and* `Authorization: DPoP
  <localStorage.__POESESSION>`, so the export is a browser snippet
  (`tools/poe2-char-export/`), not something `collect.ps1` can run. The file carries
  `"game": "poe2"`; `readAccountExport` routes it to `poe2/site-export.ts`, and everything after
  reading is the shared import (never overwrite, league chosen by hand, match by name **within
  the export's game** — names are unique per realm, not across games). Items arrive in the
  official API's Item shape: mods are objects whose `flags` become tags, text carries
  `[Tag|Display]` markup that `plainText` strips, property values are templated into names as
  `{0}`, flasks and charms share the "Flask" inventory (x 0–1 flasks, 2–4 charms), `Weapon2` and
  `Offhand2` are the second weapon set, rune mods are tagged `enchant, rune`, and a skill an item
  grants is a skill group with its supports. The class is an ascendancy id whose number is not
  list order (`Monk3` is Acolyte of Chayula) — `ASCENDANCY_IDS`, from the site's tree data.
  The site has **no passive tree, no skill-slot gems, no weapon-set passives and no tree jewels**;
  those need a Path of Building 2 share code, because only the official OAuth API serves them
  and GGG is not registering new applications. The build's source is `poe2-site` with its own
  `POE2_SITE_VERSION`; `exportVersion` gives the replay each mapper's own version, since both
  share `api_version`. Origin is `certain` only while the character is still in a running league
  (strip SSF/HC prefixes, match the catalogue name), graded from the last login otherwise.
  Gear never touches Path of Exile 1's catalogue: `gearFor(game)` gives Path of Exile 2 no local
  art, its own tooltip that derives nothing, and its own gem colours, because the games share
  base and gem names (Ruby Ring, Spark) and not the numbers behind them. The site's tree data is
  public but unversioned; `npm run tree:poe2:snapshot` keeps a gzipped copy per change in
  `scripts/data/poe2-trees/`, for drawing trees later.
- **For Path of Exile 2, a Path of Building 2 code is the whole build, and outranks the site's
  export.** The owner wants to archive a character from a code alone, without also running the
  export. A code (`<PathOfBuilding2>` root, read by `poe2/pob.ts` and `poe2/pob-items.ts`) carries
  the passive tree — with `weaponSets` and the `attributeChoices` made on "+5 to any Attribute"
  nodes — the skill-slot gems (each group's `weaponSets` and `source`: "Default Attack",
  "Tree:<node>"), tree jewels, gear, config and computed stats. `composePoe2Build` in
  `src/lib/games/builds.ts` returns the code's build whenever there is a code, and the export's
  only when there is not; the export's payload stays on the row underneath, as the one record of
  the game's own figures and last login. Every writer goes through it — pasting or adding a code,
  an import onto a character that has one (which the never-overwrite rule already skips unless
  ticked), and `reparseStaleBuilds`, whose Path of Exile 2 branch rebuilds against
  `POE2_PARSER_VERSION` and `POE2_SITE_VERSION` and never reaches the Path of Exile 1 parser.
  `parseCodeFor(game, code)` refuses the other game's code by name. A code carries no character
  name, so the add form requires one rather than falling back to the main skill. Gear from a
  code is drawn from Path of Exile 2's own item-art index (`npm run art:poe2`, from repoe-fork's
  `/poe2/` bases and uniques; single-frame WebP that `art:fetch` downloads into
  `public/items/poe2/`), and a test fails if any equipped item in the fixture code has no picture.
  No tree link is kept, because Path of Building 2 writes Path of Exile 1's viewer URL. Its stat panels add Spirit
  and Deflection (`poe2/stats.ts`). Path of Exile 1 keeps its rule: the last source applied is the
  build.
- **Path of Exile 2's tree is drawn from Path of Building 2's tree data, and checked against the
  game's.** `npm run tree:poe2` (`scripts/build-poe2-tree-svg.ts`) turns
  `src/TreeData/<ver>/tree.json` from PathOfBuilding-PoE2 into `public/trees/poe2/<ver>.svg`, in
  exactly Path of Exile 1's format (`n<skill>` circles, `c<a>-<b>` paths, `currentColor`), so
  `PassiveTree` draws both games unchanged. That source is chosen because it is versioned like
  the codes (`treeVersion="0_5"`); pathofexile2.com's copy has the game's own positions and no
  version, so it is the test: every main-tree passive lands within 8 units of it
  (`tests/poe2-tree.test.ts`). Its differences from Path of Exile 1's export: groups are a list
  and a node's `group` counts from 1; orbit angles come from `orbitAnglesByOrbit`; and a
  connection's own `orbit` makes it an arc of that radius, bending by its sign, when the ends are
  close enough — PoB2's `BuildConnector`. Ascendancies are moved into the empty centre, inside the
  class-start ring, scaled to fit, and only the character's is revealed; the reveal class turns
  spaces into underscores (`asc-Acolyte_of_Chayula`), which the component matches. A "choose one"
  ascendancy passive's options are written hidden (placed, so counted) and
  `poe2/tree-data/<ver>.json` maps each to its parent, so the tooltip names the option taken
  (Point Blank, not Projectile Proximity Specialisation). "+5 to any Attribute" tooltips name the
  attribute chosen, and each weapon set's passives are coloured (orange, blue) with a legend.
  Every version PoB2 ships, 0.1 to 0.5, is generated (`VERSIONS` in the script); 0.2 to 0.5 are
  each checked by a fixture code saved on it, and 0.1 still lacks one. **The tree version is the
  `<Spec treeVersion>`, never `<Build targetVersion>`**, which PoB2 writes as `0_1` on every save:
  a 0.1 character imported into PoB2 today carries its 0.5 allocation and is drawn on 0.5. PoB2's
  own character import uses its latest tree, so most codes are the newest version, but a save
  made during an earlier league keeps that league's tree and is drawn on it; a version not yet
  generated falls back to the newest Path of Exile 2 tree with the page saying so.
- **A skill is shown with its gem or not at all, and the gem data comes from the live export.**
  Every index here is built from `repoe-fork.github.io` (Path of Exile 1 at the root, Path of
  Exile 2 under `/poe2/`), never from the RePoE GitHub repository's `master` branch: that
  branch stopped at 2024-12-15, and a skill added since — Kinetic Fusillade — was in nobody's
  index. The page then showed the character's own words for it as a build card with no gem.
  `buildSkill` in `src/lib/games/skills.ts` now returns only a skill its game's index can draw
  (the recorded gem, or notes that are exactly a gem's name), and the character header, the
  banners and the build rankings all go through it. When a real gem goes missing, refresh the
  index (`npm run gems:index`, `gems:art`, `gems:poe2`, then `art:fetch`) rather than loosening
  that check; `tests/gems.test.ts` fails if an offered skill has no art. A gem the game
  renamed keeps its old name through `poe1/gem-renames.json` (Dark Pact → Dark Bargain, Lesser
  Multiple Projectiles → Multiple Projectiles), because the data only knows the current name
  and the archive spans every version. Path of Exile 2's gems are its own index in
  `poe2/gems.ts`: 108px single-frame pictures from the export's `Art/`, and a skill name
  shared with Path of Exile 1 ("Spark") never resolves to the other game's gem.
- **There are two sources for a build, and they know different things.** A Path of Building
  export is an engine's opinion: it computes life, resistances and damage, and writes none of
  the game's own numbers into an item. An export from the game's character endpoints is the
  opposite: it reports exactly what the game shows — a requirement a socketed gem raised
  (marked `(gem)`), a shield's modified block, a gem's attribute — and computes nothing at all,
  so a character imported that way has an empty `stats` and renders no stat panels. Never
  invent one. `src/lib/games/poe1/poe-api.ts` is the whole mapping; `pob.ts` is the other.
  Where an item states a figure, the tooltip uses it and does not derive it — `requirementParts`
  returns `item.requires` when there is one, and `shieldBlock` returns `item.block`. That same
  export confirmed the derivation's rounding: 115 Int with 18% reduced requirements reports 94,
  and 115 x 0.82 is 94.3.
- **Path of Building imports the same data this does, and adds arithmetic — not facts.** Its
  Import tab calls `https://api.pathofexile.com/character/<name>` (`src/Classes/PoEAPI.lua`,
  OAuth, `client_id=pob`) and hands the response straight to `ImportItemsAndSkills` and
  `ImportPassiveTreeAndJewels`, which read `equipment`, `jewels`, `passives`, `class`, `league`
  and `level`. The collector stores every one of those in `raw`, so a Path of Building route
  would bring back no item, gem, jewel or passive that the export route is missing. What it
  would bring back is `<PlayerStat>`: those elements are written at save time from
  `calcsTab.mainOutput`, the calculation engine's own numbers, and they are the one thing no
  export of any kind contains.
  The route exists and is checked: `src/HeadlessWrapper.lua` has `loadBuildFromJSON`, whose own
  comment points at the official character endpoint, and a share code is one line —
  `common.base64.encode(Deflate(build:SaveDB("code")))` with the base64 made URL-safe. Grinding
  Gear Games' community repository publishes the image its own CI runs headless in,
  `ghcr.io/pathofbuildingcommunity/pathofbuilding-tests`. Restructuring a collected character
  into what the importer wants is rearrangement, not new data: `equipment` is `raw.items.items`,
  `jewels` is `raw.passives.items`, `passives` is `raw.passives`, and name, class, league and
  level are `raw.character`. Two caveats that would decide whether the numbers are worth
  storing, both stated by the wrapper itself: an imported build has no main skill selected and
  no configuration set, so life, energy shield and resistances would be sound while damage would
  be whatever the defaults produce — not a figure the owner would quote. The export's
  `main_skill` heuristic is the obvious thing to point at the socket group.
- **A generated share code would not replace the stored export payload.** A code is a Path of
  Building-shaped re-encoding and drops what that program has no field for: the last login time
  the origin-league inference runs on, each item's 64-hex id, the league a character sits in now,
  the game's own displayed figures — the `(gem)` requirement marker above all — and the passive
  names, since a code stores node hashes and naming them needs the tree data the archive does not
  ship. It also cannot say which characters have been deleted, because that only falls out of
  diffing one snapshot against the next. Whatever route produces the stats, the payload stays.
- **A build's source is the only thing allowed to rewrite it.** A character can hold both a
  share code and an export payload. `parser_version` and `api_version` are separate columns
  because the two mappers move independently, and `reparseStaleBuilds` reads `data.source` to
  decide which one may re-derive the row; the other is only marked current so it stops being
  re-read every boot. Without that, a `PARSER_VERSION` bump would silently replace a build that
  came from the game with one derived from a stale share code.
- **An unattended import fills, and neither creates nor overwrites.** `collect.ps1` and
  `/api/import/poe` run with nobody watching, and the two questions an export cannot answer both
  need a person: which league a character the archive has never seen belongs in, and whether a
  finished character should be replaced. So `applyImport` is given a `leagueFor` that always
  returns null and an `overwrite` that always returns false, and the response names what it
  skipped for each reason. Both need the upload page.
- **A red or unproven build is never deployed, and a watcher that cannot tell says so.**
  `watch.ps1` reads the commit's check runs before handing over to `update.ps1`, and treats
  four states separately: green deploys, red refuses, pending waits, and unreachable waits but
  starts logging loudly after about an hour. Pending and unreachable must not read the same in
  the log — pending clears itself in minutes, while unreachable, repeated, means the thing is
  deploying nothing while looking healthy, which is the failure worth shouting about. The
  status is read anonymously, which is 60 requests an hour per address and far more than the
  few this needs; `GITHUB_TOKEN` in the environment lifts it if that is ever the obstacle.
- **A player's Path of Exile account lives on the player row**, in `users.poe_account`. It is
  there so the collector script holds no configuration: it asks `/api/players` which accounts to
  read, and every export names the account it came from, so `playerForAccount` matches the two
  without anyone passing a flag. Two players cannot claim one account. Both endpoints are
  unauthenticated, like every other write here.
  **The archive works the account out for itself wherever it can.** Every imported character
  stores the payload it came from and that payload names the account, so `backfillAccounts` in
  `migrate()` fills a blank one on the next boot from what is already in the database — asking
  someone to type it into a form is asking them to re-enter a fact the archive can see, and it
  is the second time they would have done it. It only ever fills a blank: an account set by hand
  is never second-guessed, and one another player already holds is left alone rather than
  duplicated. This archive's own two accounts are in `src/lib/accounts.ts` and applied on boot,
  before the inference, so there is no setup step at all: account names are public — the profile
  page serves the character list under one — so there is nothing to protect and no reason to
  make anyone type one in. A player not listed there has two other ways in, each needed once:
  the field under "Manage player", or `.\collect.ps1 -Player <name> -Account "Name#1234"`,
  which the import records through `rememberAccount`. All three fill a blank and nothing more,
  so they cannot fight each other and an account changed by hand always wins.
- **The league never comes from the export.** Every character migrates to a permanent league
  when its own ends, so the league the API reports says nothing about where it was played. The
  collector guesses from the last login time and grades its own guess — and the owner's record
  is first-hand and beats it. So the importer matches on name and fills a character in where it
  already sits; a character the archive has never seen is created only in a league chosen by
  hand, with the guess offered as a default only where the collector called it `certain`. An
  import also leaves notes, `/played` and the main skill alone: the record names the build
  ("golemancer corrupting fever exsanguinate") where the export can only name the gem with the
  most supports linked to it.
- **The upload is staged between the two buttons, not re-sent.** React resets a form once its
  action returns, which empties the file input, so the preview writes the upload to a file under
  `os.tmpdir()` and the plan carries its name. The token is checked against a UUID pattern before
  it is joined to a path. Server actions also cap a request body at 1 MB by default and a whole
  account is several megabytes, which is what `serverActions.bodySizeLimit` in `next.config.ts`
  is for.
- **Only equipped and socketed items are gear.** A Path of Building export lists every item
  the build has ever held; `build.slots` and `build.treeJewels` are what "in use" means, and
  the rest are spares that must not be drawn. The reverse holds for a slot the paper doll has
  no cell for — the weapon swap set, a heist trinket, a socketed abyss jewel: those are worn,
  so `GearGrid` draws them in a row beneath the doll rather than dropping them.
- **`BuildData` changes stay additive.** Rows written by older versions must still render;
  `mapCharacter` merges parsed JSON over `emptyBuild()` for exactly this reason.
- **better-sqlite3 stays in `serverExternalPackages`.** It is a native module; bundling it
  breaks the standalone Docker output.
- **Fonts are vendored** in `src/app/fonts` and loaded with `next/font/local`. Do not
  reintroduce `next/font/google` — it makes the Docker build depend on reaching Google.
- **No auth exists, by design.** Anything reachable can be edited by anyone. Do not add
  features that assume a trusted caller without saying so.
- **Do not bind-mount the SQLite file to a Windows path.** WSL2 file-share locking is
  unreliable for SQLite. The named volume is deliberate.
- **`package-lock.json` is generated by npm 11**, the version on the owner's machine. npm 10
  and npm 11 emit different bundled-dependency entries, so a lockfile written by the older
  npm gets rewritten by every local install there, dirtying the tree and blocking both
  `git pull` and `update.ps1`. When changing dependencies from a sandbox running npm 10,
  use `npx npm@11 install ...` and commit the result.

## Before pushing

Run `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build`. For anything
visual, start the app and screenshot the affected page rather than assuming — several
real defects in this project (a clipped resistance label, a missing CSS chunk from a
stale server, an over-eager dirty-tree guard) were only visible when actually looked at.
For schema changes, exercise the migration against a populated pre-change database.
CI runs the same checks plus a container boot, so a red build means do not deploy. **Check
that the CI run for your push is green before telling the owner to deploy** — a deploy was
sent to a red build once because nobody looked, and CI had already caught the fault.
Note that CI runners have fewer cores than the owner's machine, so build-time concurrency
bugs can pass there and still fail on the server.

## Working with the owner

- **Still in development: nothing stored is final (as of 2026-09-24).** The owner uploads the
  finished characters only once development is done, so every character in the archive today,
  dev or deployed, is test data. Re-deriving, reshaping or breaking stored builds is fine, and so
  is changing the import process. Perfecting the functionality comes first. The rules above
  still describe how the finished product must behave, so keep their guards; just don't let
  protecting today's rows hold a fix back. Remove this note when final uploads begin.

- Wants scientific, critical, objective answers. No preamble, no restating the question,
  no flattery. Recommend one option rather than surveying five.
- Flag guesses as guesses and put uncertainty in the data model rather than hiding it —
  the tentative-end-date flag exists because of this.
- Runs the site on a Windows PC home server (`X:\halls`) with Docker Desktop, Pi-hole,
  Jellyfin and Immich, on Node 24. Answers involving that box should be PowerShell, not bash.
  Local installs there need `npm install --ignore-scripts` — npm otherwise runs `node-gyp
  rebuild` on better-sqlite3, which has no toolchain to build with and does not need one
  (the package ships N-API prebuilds). See the README's development-loop section.
- **Periodically offer concrete ways to brief you better.** The owner explicitly asked for
  this and found it valuable: when a request would have been faster to act on with
  different framing — batching several items, stating acceptance criteria, attaching a
  screenshot, saying which facts are uncertain — say so briefly and move on. Do it when it
  would actually have changed the work, not as a recurring ritual, and never at the expense
  of just doing the task.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
