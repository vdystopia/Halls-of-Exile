# poe-char-export

Pulls every Path of Exile 1 character on an account into one JSON file (plus an optional CSV) that a dashboard can read. It covers the character list, equipped items with socketed gems, tree jewels and passive allocations. The same file runs in the browser or in Node 18+.

Verified on 2026-09-16 against `zxBlasphemy#5164`: 45 characters, 0 errors, 0 unresolved passive nodes. The tree links it builds decode to the same allocation as the links pathofexile.com builds itself (checked on a normal, a bloodline, a cluster-jewel and a Phrecia character) and open correctly in the official viewer.

## Data source

The profile page is a thin client over the JSON endpoints below. Your characters tab is public, so no login or cookie is needed.

| Data | Request | Anonymous rate limit per IP (observed 2026-09-16) |
|---|---|---|
| Character list: name, class, league, level, `lastLoginTime` | `GET /character-window/get-characters?accountName=zxBlasphemy%235164&realm=pc` | `backend-character-request-limit`: 15/min, 90/30 min, 180/2 h |
| Equipped items and socketed gems | `POST /character-window/get-items` (form fields `accountName`, `character`, `realm`) | `backend-item-request-limit`: 30/min, 90/30 min, 180/2 h |
| Passives, masteries, tattoos, tree jewels, cluster subgraphs | `GET /character-window/get-passive-skills?accountName=…&realm=pc&character=…` | shares the character limit |
| Live leagues | `GET /api/leagues?type=main&realm=pc` | `ladder-view` |
| Node names and stats | JSON embedded in `/passive-skill-tree` and `/passive-skill-tree/alternate` | none observed |

- Logged-in requests have stricter per-account limits (character endpoints: 10/min, 50/30 min). The exporter therefore goes anonymous first and switches to a session only on a 401/403, which means the profile is private.
- Going over a limit locks you out for up to 1 hour. The exporter reads the `X-Rate-Limit-*` headers and waits instead of going over.
- GGG doesn't document these endpoints, so they can change. The supported route is the OAuth API (`api.pathofexile.com/character`, scope `account:characters`), which requires registering an application with GGG.
- The API doesn't expose creation date, origin league or experience anywhere. Anonymous responses also leave out main-inventory items.

## Run

### Browser (one-off)

1. Open any pathofexile.com page.
2. Open DevTools and go to Sources → Snippets → New snippet. Paste `poe-char-export.js` and run it with Ctrl+Enter.
3. In the console, run `await PoeExport.exportToFile({ account: 'zxBlasphemy#5164' })`. It saves `poe-characters-zxBlasphemy_5164-YYYY-MM-DD.json`.

A full export of 45 characters takes about 94 requests and 3 minutes. The limiter pauses about 40 seconds after every 14 character-endpoint calls. `PoeExport.state` shows progress. `PoeExport.toCsv(data)` returns the CSV text.

### Node / home server (scheduled)

```sh
node poe-char-export.js --account "zxBlasphemy#5164" --out /data/characters.json --csv /data/characters.csv
```

- **Incremental runs.** When `--out` already exists, a run makes 2 requests plus 2 per character that needs refetching. A character is refetched when its `lastLoginTime`, level, league or class changed, or when it was played in the last 12 hours (`--refresh-recent-hours`). That second rule exists because `lastLoginTime` only moves on login, so gear swaps mid-session are otherwise invisible.
- **Tree cache.** Passive tree data is cached for 24 h in `.poe-tree-cache/` next to the output file.
- **Failed characters.** If a character fails to fetch, its previous data is kept and marked `stale: true`, and it is retried on the next run.
- **Exit codes.** `0` ok, `2` finished with per-character errors, `1` fatal.

Docker and cron, every 20 minutes:

```cron
*/20 * * * * docker run --rm -v /srv/poe:/data node:22-alpine node /data/poe-char-export.js --account "zxBlasphemy#5164" --out /data/characters.json --csv /data/characters.csv --quiet
```

Run it from your home IP, because Cloudflare may challenge datacenter IPs. Add `--user-agent "poe-char-export/1.0 (contact: you@example.com)"` to identify yourself to GGG. `--help` lists all options, including `--no-raw`, `--only`, `--leagues`, `--poesessid` (private profiles) and `--pretty`.

## Output (schema_version 1)

Top-level fields: `generated_at`, `account`, `realm`, `auth`, `stats` (requests, fetched vs reused, wait time), `rate_limits` (last seen counters), `leagues` (`live`, `calendar_additions`), `removed_since_previous`, `errors[]` and `characters[]` (most recent login first).

| Character field | Contents |
|---|---|
| `name`, `realm`, `league`, `level`, `class` | As reported by the API. `league` is the current league. |
| `base_class`, `ascendancy`, `bloodline` | `ascendancy` is null when the character is unascended. `bloodline` comes from the API's `alternate_ascendancy`. |
| `last_login`, `last_login_unix` | The only time signal the API provides. |
| `league_flags` | `permanent`, `hardcore`, `ssf`, `ruthless`, parsed from the league name (handles `SSF R Allflame`-style names). |
| `origin_league` | Inferred; see the next section. |
| `main_skill` | Heuristic: the active gem with the most linked supports, with utility gems (aura, guard, warcry, movement, curse, trigger, etc.) penalised. `utility: true` means no non-utility skill was found. |
| `uniques` | Names of equipped unique items. |
| `equipment[]` | Per item: `slot` (`Helm`, `BodyArmour`, `Ring2`, `Flask 1`–`Flask 5`, `Weapon (swap)`, …), `name`, `base_type`, `rarity`, `ilvl`, `identified`, `influences[]`, `flags` (corrupted, fractured, synthesised, mutated, searing/tangled, …), `properties{}`, `requirements{}`, `mods{}`, `sockets` (e.g. `"R-G-B B"`), `links`, `socketed[]` (name, tags, support, level, quality, group, links) and `icon`. `mods{}` holds `implicit`, `explicit`, `crafted`, `fractured`, `enchant`, `crucible`, `scourge`, `mutated`, `utility` and so on. |
| `passives` | `tree_url` opens the official viewer with this allocation and jewels. `tree_variant` is `default`, or `alternate` for Phrecia ascendancies. Named node lists: `keystones[]`, `notables[]` (includes cluster notables), `ascendancy_notables[]`, `bloodline_nodes[]`, `masteries[]` (name plus the chosen effect text), `tattoos[]`. `jewels[]` holds the normalized tree jewels with `socket_hash`. `nodes[]` lists every allocated node (hash, name, kind, stats). Also `counts{}`, and the raw `hashes`, `hashes_ex` and `mastery_effects`. |
| `raw` | Untouched API payloads. `--no-raw` drops them, which shrinks 45 characters from 4.1 MB to 1.7 MB. |

## Origin league inference

The field has this shape: `origin_league = { league, league_full, version, basis, confidence, candidates[], excluded?, batch_logins? }`

| `confidence` | Rule |
|---|---|
| `certain` | The current league isn't permanent, so the origin is that league. |
| `likely` | The character is in a permanent league, and its last login fell inside a finished challenge league's run. |
| `ambiguous` | Same as `likely`, but an event such as Phrecia overlapped that time. `candidates` lists both leagues. |
| `weak` | Either the last login came after that league ended (the character had already migrated), or 5 or more permanent-league characters logged in within 36 h of each other. A cluster like that looks like an account-wide gear or stash pass, not play. |
| `none` | Either the last login happened during a league that is still live, or it predates the calendar. A Standard character can't come from a live league; `excluded` names that league. |

This is a proxy. `lastLoginTime` is the last login, not the creation date. The inference is right for characters retired when their league ended and wrong for characters played in Standard later. Hardcore deaths move a character to a softcore league mid-league, which it can't see.

League dates live in `LEAGUE_CALENDAR` at the top of the script. Leagues missing from it are picked up from `/api/leagues` while they are live and kept in `leagues.calendar_additions` on later runs.

## Tests

`node test/run-tests.js` runs everything against a mock server. It covers rate-limit pacing, 429 retry, incremental sync, recent-character refresh, stale refetch, private profiles, 404s, and tree-URL encoding checked against real pathofexile.com URLs.
