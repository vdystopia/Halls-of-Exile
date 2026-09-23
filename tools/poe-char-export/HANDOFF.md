# Handoff: PoE1 character export → character archive

Context for a workstream that wasn't part of building this. Account used throughout: `zxBlasphemy#5164`, realm `pc`, PoE **1**.

## What exists now

| File | What it is |
|---|---|
| `poe-char-export.js` | The exporter. One file, runs unchanged in a browser console on pathofexile.com or as a Node 18+ CLI. No dependencies. |
| `README.md` | Operator docs: endpoints, rate limits, CLI flags, full output schema, origin-inference rules. |
| `test/run-tests.js` | 9 tests against a mock pathofexile.com (rate-limit pacing, 429 retry, incremental sync, stale refetch, private profiles, tree-URL encoding vs. real site URLs). `node test/run-tests.js`, no deps. |
| `poe-characters-zxBlasphemy_5164-2026-09-23.json` | The export itself, in the account owner's Downloads folder. This is the file to plug in. |

## The export file

Produced 2026-09-23T22:38Z. **43 characters, 0 errors, 0 unresolved passive nodes.** 90 HTTP requests, 190 s wall clock (158 s of that was the rate limiter idling on purpose).

Sizes, measured on this export:

| Variant | Raw | gzip |
|---|---|---|
| Full (`raw` payloads included) | 4.07 MB | 0.77 MB |
| `--no-raw` | 1.62 MB | 325 KB |
| CSV summary (`toCsv`) | 27 KB | — |

Current league split: Standard 32, Solo Self-Found 6, SSF Allflame 2, Allflame 1, Phrecia 2.0 1, SSF Ruthless 1.

Top level: `schema_version` (1), `exporter`, `generated_at`, `account`, `realm`, `auth`, `tree_data`, `stats`, `rate_limits`, `leagues`, `removed_since_previous`, `errors[]`, `characters[]` sorted by last login descending.

Each character carries, in rough order of how much you should trust it:

1. **Verbatim from the API** — `name`, `league`, `level`, `class`, `last_login_unix`, `gold`, and the untouched payloads under `raw` (`raw.character`, `raw.items`, `raw.passives`).
2. **Mechanical normalization** — `base_class`, `ascendancy`, `bloodline`, `league_flags`, `equipment[]` (slot, name, base type, rarity, ilvl, influences, flags, properties, requirements, mods bucketed into implicit/explicit/crafted/fractured/enchant/crucible/scourge/mutated/utility, socket string, link count, socketed gems with tags/level/quality), `uniques[]`, and `passives` (keystones, notables, ascendancy notables, bloodline nodes, masteries with the chosen effect text, tattoos, tree jewels, every allocated node with name/kind/stats, plus raw `hashes`). Lossless in the sense that `raw` is still there to re-derive from.
3. **Heuristics, labelled as such** — `main_skill` (active gem with the most linked supports, utility gems penalised; carries `utility: true` when only auras/guards/warcries were found) and `origin_league`.

`passives.tree_url` is a link to the official tree viewer. The v6 code is built here, not scraped, and was checked byte-for-byte against the URLs pathofexile.com generates for a normal, a bloodline, a cluster-jewel and a Phrecia character.

## Origin league: what it is and isn't

GGG exposes no creation date and no origin league. Characters migrate to Standard when their league ends, so `league` is useless as origin. The one usable signal is `lastLoginTime`, which the profile page doesn't show but `get-characters` returns. Mapped against a league calendar embedded in the script:

| `confidence` | Meaning |
|---|---|
| `certain` | Current league isn't permanent — that league is the origin. |
| `likely` | Permanent league now; last login fell inside a finished challenge league's run. |
| `ambiguous` | Same, but an event (Phrecia, Phrecia 2.0) overlapped; `candidates[]` has both. |
| `weak` | Last login came after the league ended (already migrated), **or** ≥5 permanent-league characters logged in within 36 h of each other — a maintenance pass, not play. |
| `none` | Last login falls inside a league that is still live (a Standard character can't have come from it; `excluded` names it), or predates the calendar. |

This export: 4 certain, 16 likely, 2 ambiguous, 16 weak, 5 none. Treat anything below `certain` as a prior, not a fact. If the archive ever holds a snapshot taken *while* a character was still in its league, that snapshot's `certain` label is the ground truth for that character forever — worth persisting separately from the inference.

## Data source and its limits

| Data | Request | Anonymous limit per IP (observed 2026-09-16) |
|---|---|---|
| Character list + `lastLoginTime` | `GET /character-window/get-characters?accountName=…&realm=pc` | 15/min, 90/30 min, 180/2 h |
| Equipped items + gems | `POST /character-window/get-items` (`accountName`, `character`, `realm`) | 30/min, 90/30 min, 180/2 h |
| Passives, masteries, tattoos, jewels, cluster subgraphs | `GET /character-window/get-passive-skills?…` | shares the character limit |
| Live leagues | `GET /api/leagues?type=main&realm=pc` | `ladder-view`: 5/5 s, 10/10 s, 15/10 s |
| Node names/stats | JSON embedded in `/passive-skill-tree` and `/passive-skill-tree/alternate` | none observed |

- The characters tab is public, so anonymous works — and anonymous limits are *looser* than logged-in ones (10/min, 50/30 min per account on the character policy). The exporter runs anonymous and only falls back to a session on 401/403.
- Blowing a limit locks the IP out for up to 1 h. The exporter parses `X-Rate-Limit-*` and paces itself; a full 43-character run costs ~44 of the 90-per-30-min budget.
- Undocumented endpoints; they can change without notice. The supported route is the OAuth API (`api.pathofexile.com/character`, scope `account:characters`), which needs an app registered with GGG. Worth doing if the archive becomes long-lived.
- Cloudflare may challenge datacenter IPs. Run collection from a residential IP. (The sandbox used to build this can't reach pathofexile.com at all — egress policy blocks the host — which is why the export was generated in the browser.)
- Tree node names come from the *current* tree. A character last played several leagues ago can hold node hashes the current tree no longer defines; those come back as `kind: "unknown"` (this export: zero).

## Things that matter specifically for an archive

- **Deletions are silent.** The API lists only live characters. The 2026-09-16 run saw 45; this one sees 43. Nothing in the API says which two vanished or when — only diffing snapshots does. `removed_since_previous` is populated only when you feed the previous export back in (`--out` pointing at the existing file). An archive should never overwrite a snapshot; append, and compute deletions on ingest.
- **`lastLoginTime` moves only on login.** Gear swaps, level-ups mid-session and passive changes are invisible until the next login, so change detection alone under-collects. The exporter compensates by refetching any character logged into within the last 12 h (`--refresh-recent-hours`). For an archive, a snapshot taken during an active session is a partial view of that session, not a final state.
- **Incremental cost is tiny.** With a previous export present: 2 requests, plus 2 per character that changed or was played recently. Hourly collection is cheap; a full refetch is the expensive path and should be rare (`--full`).
- **Item `id`.** Every item carries a 64-hex `id`. It's tempting as a primary key for tracking an item across characters and snapshots, but whether it survives modification (crafting, corrupting, socket changes) was not tested here. Verify before relying on it; otherwise key items by (character, slot, snapshot).
- **Character names** are the only stable identifier the API offers — no character IDs on these endpoints (the OAuth API does expose an `id`). Names are unique per account at a time, but a deleted name can be reused, so an archive keyed on name alone can silently merge two different characters. Keying on (name, first-seen snapshot) or carrying a surrogate key is safer.
- **Schema versioning.** Output carries `schema_version: 1` and `exporter.version`. Ingest should refuse unknown majors rather than guess. Keeping `raw` means any future normalization change can be replayed over the whole archive without refetching — the strongest argument for storing the full 4 MB variant rather than `--no-raw`.
- **Storage**, if you keep everything: ~0.77 MB gzipped per full snapshot. Hourly for a year is ~6.7 GB; daily is ~280 MB. Storing only changed characters cuts that by roughly the fraction that changed (usually 1–3 of 43).
- **League calendar drift.** `LEAGUE_CALENDAR` at the top of the script is hand-maintained through 3.29 (Curse of the Allflame, started 2026-07-24). Leagues missing from it get picked up automatically from `/api/leagues` while they are live and persisted in `leagues.calendar_additions`, so an incremental pipeline self-heals for current leagues; historical rows still need a human.

## Already verified, don't redo

- Tree-code encoding (version 6: class byte, `ascendancy | bloodline << 2`, node list, cluster nodes from `hashes_ex` unshifted, mastery pairs as `[effect, node]`) matches the site's own links; one generated URL was opened in the official viewer and rendered with the right class, ascendancy, bloodline and jewels.
- 43/43 characters normalize with zero unknown nodes, including cluster-jewel subgraphs, tattoos (`skill_overrides`), bloodlines and the Phrecia alternate-ascendancy tree.
- Rate-limit pacing, 429 retry, stale refetch and incremental reuse are covered by the test suite against a mock server.

## Open decisions for the archive

1. Snapshot cadence and whether to store full snapshots or character-level deltas.
2. Whether to promote `origin_league` to a stored, human-correctable field (the inference is recomputed on every run and will change as the calendar and live-league state change).
3. Whether to move to the OAuth API for durability, accepting the app-registration step.
4. Whether item `id` is stable enough to be an entity key.
