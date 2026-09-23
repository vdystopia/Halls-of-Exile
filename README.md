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
- **A league page** (`/players/<username>/<game>/<league>`) with that league's characters, the
  player's challenge completion (`32/40`), the league window and a note about how the league went.
  The characters sort by level, name, class, main skill, `/played` or date added, and filter by
  class and main skill — all in the query string, so a filtered view is a link.
- **Search across a player's whole archive** (`/players/<username>/search?q=`) by character
  name, skill (main skill or any socketed gem) and unique item equipped, across every league.
- **A per-player JSON export** (`/players/<username>/export`, linked from the player page): the
  player, their league records, every character with its share code and stored build, and every
  league those refer to — enough to move an archive to another instance or hand it to its owner.
  The format is documented in [`docs/export-format.md`](docs/export-format.md).
- **Per-character `/played` time**, typed in by hand — no export carries it — summed into the
  player header as the archive's total time played.
- **A character sheet** (`/players/<username>/<game>/<league>/<character>`) laid out like pobb.in: defence
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
git clone <this repo> && cd Halls-of-Exile
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
| Update to the latest code | `.\update.ps1` on Windows, `./update.sh` on Linux (see below) |
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

## Deploying on Linux (pc2)

pc2 is the Ubuntu home server running Docker Engine. It runs the same image with
`docker-compose.pc2.yml` layered over `docker-compose.yml`, and deploys with `./update.sh`, the
Linux twin of `update.ps1`: same backup, pull, rebuild, health-check, automatic rollback and
single-run lock.

What the override changes:

- **Data is a bind mount**, `/srv/data/halls` on the host (override with `HALLS_DATA_DIR` in
  `.env`), instead of the named volume, so the host's own backup job can see it. On a Linux
  filesystem that is safe; the rule against bind-mounting the archive is about Windows paths under
  WSL2. The directory must exist and belong to uid 1000, the container's `node` user — `update.sh`
  refuses to start otherwise, and compose will not create it (a directory Docker created would be
  root's).
- **No host port is published.** The container joins the external Docker network `proxy`, and the
  reverse proxy on that network reaches it as `http://halls-of-exile:3000`. There is still no
  login (see above), so the proxy is where any authentication goes.
- The healthcheck is unchanged. It runs inside the container, so it needs no port, and neither does
  `update.sh`: it probes `/api/health` through `docker compose exec`.

### First-time setup

Needs Docker Engine with the compose plugin (2.24 or later), `git`, and a user in the `docker`
group.

```bash
git clone https://github.com/vdystopia/halls-of-exile.git ~/halls-of-exile && cd ~/halls-of-exile
cat > .env <<'ENV'
COMPOSE_FILE=docker-compose.yml:docker-compose.pc2.yml
TZ=UTC
ENV
sudo install -d -o 1000 -g 1000 -m 750 /srv/data/halls
docker network inspect proxy >/dev/null 2>&1 || docker network create proxy
```

`COMPOSE_FILE` in `.env` is read by `docker compose` itself, so every compose command in this
folder — `update.sh`, `backup.sh`, `docker compose logs`, `docker compose exec` — uses the override
without a `-f` flag. Change `TZ` to the server's own zone.

The item art is committed, but the ascendancy emblem sheet is not. Copy `public/ascendancy.webp`
over from the Windows checkout, or fetch it on pc2 without installing Node:

```bash
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/app -w /app node:22-bookworm \
  sh -c 'npm ci --ignore-scripts && npm run art:fetch'
```

Then either migrate the existing archive (next section) or start empty with `./update.sh`.

### Moving the archive from the Windows server

The Windows archive lives on the `halls-data` named volume, which the host cannot copy safely
while SQLite has it open. Take a consistent copy through the container instead, move that one
file, and start pc2 on it. Nothing on Windows is deleted, so it stays the fallback until pc2 is
proven.

**1. On Windows (PowerShell, in `X:\halls`):** note the counts, take the copy, pull it out of the
volume, and stop the site so nothing is written to the old archive after the copy.

```powershell
Invoke-RestMethod http://localhost:3000/api/health    # note users, characters, leagues
docker compose exec -T halls node scripts/backup.mjs /data/backups/migrate.db
docker compose cp halls:/data/backups/migrate.db .\migrate.db
docker compose stop
Get-FileHash .\migrate.db -Algorithm SHA256
scp .\migrate.db <you>@pc2:~/halls-migrate.db
```

`backup.mjs` checks the copy's integrity before it keeps it, and writes it as a single file with no
`-wal` beside it, so this one file is the whole archive.

**2. On pc2:** check the file arrived intact, put it in place owned by uid 1000, and deploy.

```bash
sha256sum ~/halls-migrate.db                          # same hash as Get-FileHash (which prints it upper-case)
cd ~/halls-of-exile
docker compose down 2>/dev/null || true               # if a trial instance is running
sudo rm -f /srv/data/halls/archive.db-wal /srv/data/halls/archive.db-shm
sudo install -o 1000 -g 1000 -m 640 ~/halls-migrate.db /srv/data/halls/archive.db
./update.sh
```

`update.sh` finishes by printing the player, character and league counts from `/api/health`; they
must match the counts noted on Windows. Then browse a few character pages through the
reverse proxy. Once pc2 is serving, `docker compose down` on Windows keeps the old one from being
started by mistake; delete its volume only once pc2's nightly backups are running.

### Updating

```bash
./update.sh                     # backup, pull, rebuild, health-check, rollback on failure
./update.sh --health-timeout 300
./update.sh --skip-backup       # only on an instance with no data yet
```

Behaviour matches `update.ps1`: it refuses to run with uncommitted changes to tracked files, backs
up to `/srv/data/halls/backups/archive-<timestamp>.db`, pulls fast-forward only, warns if item art
is behind the catalogue, and if the build fails or the new container never reports healthy it
resets to the previous commit, restores the previous image (kept as `halls-of-exile:rollback`) and
checks that it is healthy again. The lock is `flock` on `.update.lock`, which the kernel releases
when the process dies, so a killed run leaves nothing stale.

### Nightly backup

`./backup.sh` is the command for the host's nightly backup job to run just before it snapshots:

```bash
/home/<you>/halls-of-exile/backup.sh    # writes /srv/data/halls/backups/archive-latest.db
```

It takes the backup through SQLite's online backup API while the site keeps serving, checks the
copy's integrity, and renames it over `archive-latest.db` only once it passes — so whenever the
snapshot runs, that file is a complete, consistent archive. The live `archive.db` next to it is
not: committed data can be sitting in `archive.db-wal`, so restore from `archive-latest.db`, never
from a snapshot of `archive.db`. It works with the site stopped too (it starts a throwaway
container on the same mount), waits up to 15 minutes for a deploy in progress rather than racing
it, and exits non-zero on any failure so the job can alert instead of snapshotting a stale copy.

As a cron entry, if the snapshot job does not call it itself:

```
30 3 * * * /home/<you>/halls-of-exile/backup.sh >> /var/log/halls-backup.log 2>&1
```

`update.sh`'s timestamped pre-deploy backups accumulate in the same folder; prune them by age if
disk matters (`find /srv/data/halls/backups -name 'archive-2*.db' -mtime +90 -delete`).

**Restore:** `docker compose down`, `sudo install -o 1000 -g 1000 -m 640 <backup>.db
/srv/data/halls/archive.db`, delete any `archive.db-wal`/`-shm` beside it, `docker compose up -d`.

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
src/lib/export.ts              per-player JSON export; format in docs/export-format.md
src/app/api/health/route.ts    health probe used by the Docker healthcheck
scripts/seed-demo.ts           demo archive, imported through the real parser
scripts/backup.mjs             consistent online backup of the SQLite archive
Dockerfile, docker-compose.yml self-hosting setup
update.ps1                     safe deploy: backup, pull, build, health-check, rollback
update.sh                      the same for Linux (pc2)
backup.sh                      consistent online backup for a nightly host job
docker-compose.pc2.yml         pc2 override: bind-mounted data, no host port, proxy network
CLAUDE.md                      architecture notes and invariants for future sessions
ROADMAP.md                     working backlog
.github/workflows/ci.yml       typecheck, lint, tests, build, container smoke test
```

Not affiliated with Grinding Gear Games.
