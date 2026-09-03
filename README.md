# Halls of the Champions

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
| Update after a `git pull` | `docker compose up -d --build` |
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

## Running it without Docker

```bash
npm install
npm run seed:demo     # optional: two demo players with imported builds
npm run dev           # http://localhost:3000
```

Production: `npm run build && npm start`.

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
| `characters` | name, slug, class, ascendancy, level, main skill, memories, the PoB code and the parsed build JSON |

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
```

Not affiliated with Grinding Gear Games.
