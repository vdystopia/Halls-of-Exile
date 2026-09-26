# Halls of Exile

An archive for a Path of Exile player's entire back catalogue of characters.

Leagues end every few months, characters get migrated to Standard, and nobody ever opens them
again. This keeps them: sorted by league, with the gear, gems, passive tree and every computed
stat that Path of Building knows about, plus the challenge count and the dates of the league they
were built in.

## What it does

- **Public player profiles.** A username and a first name. No password, no email, no sessions —
  every archive here is meant to be browsed by anyone.
- **A player directory** at `/players`, listing everyone with their character and league counts.
- **A league index per player** (`/players/<username>`) covering every patch from 1.0 Domination /
  Nemesis to the current league, with league dates, characters archived, and challenge progress.
- **A league page** (`/players/<username>/<game>/<league>`) with that league's characters, the player's
  challenge completion (`32/40`), the league window and a note about how the league went.
- **Per-character `/played` time**, typed in by hand — no export carries it — summed into the
  player header as the archive's total time played.
- **A character sheet** (`/players/<username>/<game>/<league>/<character>`) laid out like pobb.in: defence
  and offence panels, resistances, the full paper-doll of gear with hover tooltips showing every
  mod, the gem setup by socket group, the passive tree summary, the build configuration, and a
  dump of every stat Path of Building computed.

Characters are added by pasting a **Path of Building export code** (or a pobb.in / pastebin /
poe.ninja link), by **importing a whole account** from the game's own character endpoints, or by
hand for characters whose build export is long gone and who are no longer on the account.

## Stack

Next.js 16 (App Router, server actions) · React 19 · Tailwind CSS 4 · SQLite via better-sqlite3.
No client-side state library, no ORM, no auth provider — the whole app is server-rendered with a
handful of server actions.

## Running it on a home server (Docker)

```bash
git clone <this repo> && cd Halls-of-the-Champions
cp .env.example .env        # optional: change the port or timezone
docker compose up -d --build
```

The site is then on `http://<server-ip>:3000` from anywhere on your LAN. That is the whole setup —
the schema is created and the league catalogue seeded on first boot, so there is no migration step
and no database to provision.

| Task | Command |
| --- | --- |
| Follow the logs | `docker compose logs -f` |
| Status and health | `docker compose ps` |
| Stop / start | `docker compose down` / `docker compose up -d` |
| Update to the latest code | `.\update.ps1` (see below) |
| Back up the archive | `docker compose exec halls node scripts/backup.mjs /data/backups` |
| Shell in | `docker compose exec halls sh` |

**Where the data lives.** The SQLite archive sits on the `halls-data` named volume, mounted at
`/data` in the container, so rebuilding the image never touches it. `docker volume inspect
halls-data` prints the path on the host. To keep the file next to the repo instead, swap the volume
line in `docker-compose.yml` for `- ./data:/data` and run `sudo chown -R 1000:1000 ./data` once —
the container runs as the unprivileged `node` user (uid 1000), not root.

**Backups.** SQLite runs in WAL mode, so copying `archive.db` on its own can miss data still in the
`-wal` file. `scripts/backup.mjs` uses SQLite's online backup API and writes one consistent file
while the server keeps running. To restore: `docker compose down`, copy a backup over
`/data/archive.db` (deleting any `-wal`/`-shm` beside it), `docker compose up -d`. Worth a weekly
cron entry on the host:

```
0 4 * * 0 docker compose -f /path/to/docker-compose.yml exec -T halls node scripts/backup.mjs /data/backups
```

**Health.** `GET /api/health` returns `{"status":"ok", users, characters, leagues, uptime}` and is
wired to Docker's healthcheck, so `docker compose ps` shows `healthy` only when the app can read
the database. Point Uptime Kuma or similar at it if you run one.

**No login, by design.** There are no passwords and no sessions — anyone who can reach the site can
create a profile and edit or delete any character on it. That is fine on a home LAN. Do not port
forward it to the open internet as-is; put it behind Tailscale, a VPN, or a reverse proxy with
authentication (Caddy `basic_auth`, Authelia, Cloudflare Access) if you want to reach it from
outside.

**Image notes.** Multi-stage build: the full `node:22-bookworm` image compiles better-sqlite3 if
your architecture has no prebuilt binary (Raspberry Pi included), and only the Next.js standalone
output plus its traced dependencies land in the `node:22-bookworm-slim` runtime image (~440 MB).
Fonts are vendored in `src/app/fonts`, so the build needs no outbound network beyond npm.

## Deploying an update

```powershell
.\update.ps1
```

Use this instead of `docker compose up -d --build`. It refuses to run with uncommitted changes,
takes a consistent backup, pulls, rebuilds, waits for `/api/health`, and **rolls back to the
previous image and commit if the build fails or the new container never reports healthy** — so a
bad push leaves the running site untouched. The previous image is kept as
`halls-of-exile:rollback`.

`npm run art:fetch` also downloads the ascendancy emblem sheet the character cards use.

Item art is copied into the image at build time, so it has to be on disk *before* the
build. `.\update.ps1` sees to that itself: after pulling, it checks every picture both games'
indexes name (`npm run art:fetch -- --check`) and fetches whatever is missing, so a deploy —
by hand or from `watch.ps1` — ships the art its code expects.

Only one update runs at a time: a second one started while the first is still going exits
immediately rather than racing it on the git index and the compose project. The lock is a held
file handle, not a PID file, so a run killed part-way leaves nothing stale to clear.

Windows blocks unsigned scripts by default. Either `Set-ExecutionPolicy -Scope CurrentUser
RemoteSigned` once, or run `powershell -ExecutionPolicy Bypass -File .\update.ps1`.

## Development loop

Do not rebuild the Docker image to look at a change. Run the dev server alongside the container:

```bash
npm install       # once
npm run dev       # http://localhost:3001, hot reload
```

After a reboot, `start-dev.cmd` in this folder opens both windows in one double-click: the
dev window running `npm run dev`, and a command window at the repository that has already
pulled. It works out of whatever folder it sits in, so nothing in it is machine-specific.

**On Windows, install with `--ignore-scripts`:**

```powershell
npm install --ignore-scripts
npm rebuild esbuild unrs-resolver
npm run dev
```

better-sqlite3 carries N-API prebuilt binaries for every platform inside the npm package, so
nothing needs compiling. Some npm/Node combinations on Windows run `node-gyp rebuild` anyway
because the package contains a `binding.gyp`, and that fails without Python and the Visual Studio
build tools. `--ignore-scripts` skips it and the bundled `prebuilds/win32-x64.node` is used, which
is what happens on Linux regardless. The second line re-runs the two postinstalls that are actually
needed — esbuild (used by `npm test`) and unrs-resolver (used by `npm run lint`). Neither is needed
by the dev server itself, so skip that line if it gives trouble.

The dev server listens on **3001** so it never collides with the deployed container on 3000, and
it uses `data/archive.db` in the working copy while the container uses its Docker volume — two
separate databases, so dev data can be wrecked freely. `npm run seed:demo` fills it with demo
players and imported builds (`-- --reset` wipes first). To work against real data, drop a backup
in as `data/archive.db`.

With the dev server running, `git pull` is enough to see a change — Next.js hot-reloads. Only run
`.\update.ps1` when the change is worth promoting to the instance the household uses.

Checks, all of which CI also runs:

```bash
npm test            # parser and league-catalogue invariants
npm run lint
npx tsc --noEmit
npm run build
```

CI additionally builds the Docker image, boots it, and fails unless the container serves
`/api/health` and renders its pages — which catches what a source build cannot, such as a missing
native module or a broken migration.

The database is a single SQLite file at `data/archive.db`, overridable with `ARCHIVE_DB=/path/to.db`.
Because state is a local file, this wants a host with a persistent disk rather than a serverless
platform.

## Importing a build

The importer accepts:

- a raw Path of Building export code (`Share` → `Generate` in PoB), or
- a link to `pobb.in`, `pastebin.com` or `poe.ninja/pob`.

Codes are URL-safe base64 over a zlib-deflated PoB XML document. `src/lib/games/poe1/pob.ts` decodes it and
`src/lib/games/poe1/items.ts` parses PoB's item text format, including `{variant:…}` selection, `{crafted}` /
`{fractured}` tags and `{range:…}` value rolls, which are resolved the same way PoB displays them.
The parsed build is stored as JSON alongside the original code, so a character page never depends
on the link staying alive.

Link imports need outbound HTTPS from the server; pasting the code itself always works offline.

## Importing a whole account

`/players/<username>/import` takes a JSON export of every character on a Path of Exile account
and fills in their gear, socketed gems, tree jewels and passive allocations in one pass. This is
the only way to archive a character whose Path of Building export was never saved — which is most
of them.

The archive never talks to the game. `tools/poe-char-export/` is the collector: one dependency-free
file that runs in a browser console on pathofexile.com or as a Node CLI, reads the account's public
characters tab, paces itself against the rate-limit headers, and writes the file the page takes.
Its own README covers the endpoints and the flags; run it from a home IP, since Cloudflare may
challenge a datacenter one.

```bash
node tools/poe-char-export/poe-char-export.js --account "you#1234" --out characters.json
```

What comes back and what does not:

| | Path of Building code | Account export |
| --- | --- | --- |
| Gear, sockets, gems | yes | yes |
| A gem's attribute colour | looked up by name | stated outright |
| Item requirements | derived from the base | the game's own figures, `(gem)` marker and all |
| Shield block | derived from the base | the modified figure |
| Passives | a node count | every node by name, with the mastery effect chosen |
| Life, resistances, damage | computed by PoB | **nothing** — the game computes none of it |
| Which league the character belongs to | — | **no** (see below) |

Because there are no computed stats, an imported character shows no stat panels until a build code
is added to it. Everything else — the paper doll, the tooltips, the gem setup, the tree — is there.

Uploading shows what the import would do before it does it. A character already in the archive is
matched by name and filled in where it already sits, keeping its league, memories, `/played` time
and main skill. A character the archive has never seen needs a league picked by hand: every
character migrates to a permanent league when its own ends, so the league the game reports is not
the league it was played in, and the collector's guess from the last login time is offered as a
default only where it is certain.

The export is kept, per character, in `characters.source_payload`, so a fix to the mapping can be
replayed over everything already imported without reading the account again.

### Running itself

One command, once:

```powershell
.\watch.ps1 -Install
```

From then on the archive keeps itself current. Two scheduled tasks are registered: one looks
every few minutes for a new commit on `Main` whose build is green and runs `update.ps1` when it
finds one, the other runs `collect.ps1` daily. Both survive a reboot and need no window left
open. `.\watch.ps1 -Once` shows what the next check would decide; `-Uninstall` removes them;
`logs\watch.log` is the record.

A red build is never deployed, and neither is one whose build has not finished or cannot be
read — it waits for the next check instead, and starts saying so in the log if that goes on for
about an hour. Everything else is `update.ps1`'s job: the backup, the health check, and the
rollback if the new container does not come up.

Why this exists: the archive runs behind a home network with no port forwarded and no SSH
exposed, so nothing outside can push a deploy in. The machine has to reach out and ask.

The simpler answer, if you are driving this with Claude Code, is to run the session **on that
machine** instead. It installs natively on Windows with no WSL:

```powershell
irm https://claude.ai/install.ps1 | iex
```

then `cd X:\halls; claude`. A session started there runs `update.ps1` and `collect.ps1`
directly, so there is nothing to poll and nothing to schedule. The watcher above is for when no
session is open — which is still the right home for the daily collection.

### Refreshing every character on its own

A player's Path of Exile account needs no setting up: the archive's own are kept in code and
applied on boot, and any other is worked out from what that player has already imported, since
every character carries the payload it came from and that payload names the account. One command
on the server does the whole loop:

```powershell
.\collect.ps1
```

It asks the running archive which accounts to read, runs the collector against each, and posts
the result back. An archived character with no gear yet gets its gear, gems, tree jewels and
passives filled in; its league, memories, `/played` time and main skill are left alone.
`-Player dystopia` does one player, `-Full` refetches everything instead of only what changed.

The two accounts this archive's players use are in `src/lib/accounts.ts` and set on boot, so
there is nothing to configure. For a player who is not listed there and has imported nothing
yet, give it once on the command line and the archive keeps it:

```powershell
.\collect.ps1 -Player someone -Account "Name#1234"
```

**It never rewrites a character that already has a build, and never creates one.** Both need a
person, for different reasons:

- An archived character is a record of what it *was*. The account says what it *is*, and an old
  character has long since had its gear pulled for the next build — refreshing it would replace
  a finished record with an empty shell. Replacing one is done by name on the upload page, where
  the box is unticked and labelled.
- The league a character belongs to is the one thing no export can answer, so a name the archive
  has never seen is printed at the end and skipped.

So a second run writes nothing at all, which is what makes it safe to schedule. Collection is
incremental — after the first run it costs two requests, plus two per character that levelled,
changed league or was played in the last twelve hours — and the collector paces itself against
the rate-limit headers, so a quiet run is mostly waiting on purpose.

`collect/` holds one export per account between runs, which is what makes them incremental. It is
not committed.

### Why this rather than a generated Path of Building code

Path of Building imports from the same place. Its Import tab calls
`https://api.pathofexile.com/character/<name>` and hands the response to the same two functions
that read `equipment`, `jewels` and `passives` — all of which the collector already stores. So a
Path of Building route would return no item, gem or passive that this one misses.

What it would return is the stats. `<PlayerStat>` elements are written when a build is saved,
from the calculation engine's own output, and no export from Grinding Gear Games contains them at
any price. Getting them means running the engine, which is possible without a human: PoB ships
`src/HeadlessWrapper.lua` with a `loadBuildFromJSON` entry point, a share code is one line of
Lua, and the project publishes the container image its own CI runs headless in. A collected
character rearranges into what the importer wants without any new data — `equipment` is
`raw.items.items`, `jewels` is `raw.passives.items`, `passives` is `raw.passives`.

Two things temper it, both stated in PoB's own wrapper: an imported build has no main skill
selected and no configuration set. Life, energy shield and resistances would be sound; damage
would be whatever the defaults produce, which is not the number anyone would quote.

Either way the export payload stays. A share code is a Path of Building-shaped re-encoding and
drops the last login time, each item's id, the league the character is in now, the game's own
displayed figures — the `(gem)` requirement marker above all — and the passive names, since a
code stores node hashes and naming them needs tree data the archive does not ship. Deletions only
fall out of diffing one snapshot against the next, which no code can do either.

## Item art

The paper doll draws each item with the game's own artwork. Two pieces make that work:

- `src/lib/games/poe1/item-art-index.json` maps every equippable base item to its art path and inventory
  size. It is generated from [RePoE](https://github.com/lvlvllvlvllvlvl/RePoE), the canonical
  dump of Path of Exile's item data, by `npm run art:index`, and is committed.
- The images themselves come from the game's image CDN, at exactly the paths RePoE records:

  ```bash
  npm run art:fetch              # ~4,500 images, both games; skips anything already present
  npm run art:fetch -- --check   # download nothing; list what is missing (exit code 3 if any)
  npm run art:fetch -- --force   # re-download everything
  npm run art:fetch -- --dry-run # list what it would fetch
  ```

1013 base items share 512 images, so this is a small download. Anything missing falls back to a
placeholder silhouette, so the site works with no art at all — running the fetch is an
improvement, not a requirement.

Items resolve by base type: a rare or unique names its base separately, and a magic item's base
is found inside the affixes wrapping it ("Seething **Divine Life Flask** of Staunching"). A unique is keyed on its own name,
because dozens of them share one base. An item read from an account export also names the picture
the game serves, which is used when the local catalogue has none.

The artwork is Grinding Gear Games'. This is a personal, non-commercial fan archive, which is
what their fan content policy covers.

## League catalogue

`src/lib/leagues.ts` holds every league with its patch number, name, expansion, dates and
challenge total. Challenge totals are 40 for 2.6 onwards, 32–36 for the 2.x cycle and 8 for the
1.x cycle. Anything the catalogue is missing — a league released after this was written, a private
league, an event such as Legacy of Phrecia — can be added from **Add a league** on any player
page; user-added leagues are marked as custom and are never overwritten when the built-in
catalogue is refreshed. Per-player challenge totals can also be overridden on the league page.

## Data model

| Table | What it holds |
| --- | --- |
| `users` | username (unique, case-insensitive), first name, optional tagline |
| `leagues` | patch, name, expansion, start/end dates, challenge total, custom flag |
| `league_records` | one row per player per league: challenges completed, total override, notes |
| `characters` | name, slug, class, ascendancy, level, main skill, memories, `/played` time, the PoB code or the account-export payload it was built from, and the parsed build JSON |

## Layout

```
src/app/                       routes (home, players, league index, league, character sheet)
src/components/                UI: forms, gear grid, item tooltips, stat panels, skill groups
src/lib/db.ts                  SQLite connection, schema, league catalogue sync
src/lib/pob.ts                 PoB code decoding and XML parsing
src/lib/items.ts               PoB item-text parser and the paper-doll layout
src/lib/stats.ts               which stats are shown, in what order, formatted how
src/lib/actions.ts             server actions (create player, add/update/delete character, …)
src/app/api/health/route.ts    health probe used by the Docker healthcheck
scripts/seed-demo.ts           demo archive, imported through the real parser
scripts/backup.mjs             consistent online backup of the SQLite archive
Dockerfile, docker-compose.yml self-hosting setup
update.ps1                     safe deploy: backup, pull, build, health-check, rollback
CLAUDE.md                      architecture notes and invariants for future sessions
ROADMAP.md                     working backlog
.github/workflows/ci.yml       typecheck, lint, tests, build, container smoke test
```

Not affiliated with Grinding Gear Games.
