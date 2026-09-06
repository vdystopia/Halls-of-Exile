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
- **A league page** (`/players/<username>/<patch>`) with that league's characters, the player's
  challenge completion (`32/40`), the league window and a note about how the league went.
- **Per-character `/played` time**, typed in by hand — no export carries it — summed into the
  player header as the archive's total time played.
- **A character sheet** (`/players/<username>/<patch>/<character>`) laid out like pobb.in: defence
  and offence panels, resistances, the full paper-doll of gear with hover tooltips showing every
  mod, the gem setup by socket group, the passive tree summary, the build configuration, and a
  dump of every stat Path of Building computed.

Characters are added either by pasting a **Path of Building export code** (or a pobb.in / pastebin
/ poe.ninja link), which fills in everything automatically, or by hand for characters whose build
export is long gone.

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
deploy: run `npm run art:fetch` first, then `.\update.ps1`. Fetching afterwards changes
nothing until the next rebuild. The script counts the images against the catalogue and says
so if they are behind.

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

Codes are URL-safe base64 over a zlib-deflated PoB XML document. `src/lib/pob.ts` decodes it and
`src/lib/items.ts` parses PoB's item text format, including `{variant:…}` selection, `{crafted}` /
`{fractured}` tags and `{range:…}` value rolls, which are resolved the same way PoB displays them.
The parsed build is stored as JSON alongside the original code, so a character page never depends
on the link staying alive.

Link imports need outbound HTTPS from the server; pasting the code itself always works offline.

## Item art

The paper doll draws each item with the game's own artwork. Two pieces make that work:

- `src/lib/item-art-index.json` maps every equippable base item to its art path and inventory
  size. It is generated from [RePoE](https://github.com/lvlvllvlvllvlvl/RePoE), the canonical
  dump of Path of Exile's item data, by `npm run art:index`, and is committed.
- The images themselves come from the game's image CDN, at exactly the paths RePoE records:

  ```bash
  npm run art:fetch              # ~512 images; skips anything already present
  npm run art:fetch -- --force   # re-download everything
  npm run art:fetch -- --dry-run # list what it would fetch
  ```

1013 base items share 512 images, so this is a small download. Anything missing falls back to a
placeholder silhouette, so the site works with no art at all — running the fetch is an
improvement, not a requirement.

Items resolve by base type: a rare or unique names its base separately, and a magic item's base
is found inside the affixes wrapping it ("Seething **Divine Life Flask** of Staunching"). A
unique currently shows its base type's art; unique-specific artwork needs a second source and is
still on the roadmap.

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
| `characters` | name, slug, class, ascendancy, level, main skill, memories, `/played` time, the PoB code and the parsed build JSON |

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
