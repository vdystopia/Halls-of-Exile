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
src/lib/games/poe2/           Path of Exile 2: classes so far, see its README
src/lib/queries.ts            reads
src/lib/actions.ts            writes — server actions only
src/lib/import.ts             applying an account export, shared by the upload
                              page and the unattended endpoint
tests/                        node:test files
tools/poe-char-export/        the collector: reads an account off the game's own
                              character endpoints and writes the JSON the import
                              page takes. Vendored as handed over, not built or
                              linted here.
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
  expansion for a league or the parent league for an event — `3.26 Mercenaries Secrets of the
  Atlas`, `3.25 Runic Strife Gauntlet Settlers of Kalguur`. An event never shows an expansion,
  and a missing patch reads `###`.
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
  game itself serves when the local one is missing, and to a silhouette when there is no remote
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
- **A gem's colour comes from an index, and no gem leads its group.** Path of Building's
  export does not carry a gem's attribute, so `src/lib/games/poe1/gem-colors.json` (from RePoE via
  `npm run gems:index`) maps metadata id and name to r/g/b/w; supports are indexed with and
  without the trailing "Support", and a transfigured gem resolves through its base gem's id.
  A socket group has no primary skill — four golems are four equal actives — so `orderGems`
  puts every active above every support and nothing is promoted to a title.
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
