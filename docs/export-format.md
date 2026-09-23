# Player export format

`GET /players/<username>/export` returns one player's whole archive as a single JSON document,
served as a download named `halls-of-exile-<username>-<YYYY-MM-DD>.json`. The **Export archive
(JSON)** link on a player's page is the same request. From a shell on the server:

```bash
curl -fsS http://127.0.0.1:3000/players/<username>/export -o <username>.json
```

Nothing in an export is private: it holds exactly what the player's pages already show, plus the
Path of Building share codes the pages link to.

The file is built by `src/lib/export.ts`, whose types are the reference; this page describes them.

## Top level

| Field | Type | Meaning |
| --- | --- | --- |
| `format` | `"halls-of-exile/player-export"` | Identifies the file. A reader rejects anything else. |
| `version` | `1` | Bumped on any change a reader has to know about. Additions of new optional fields do not bump it; readers ignore fields they do not know. |
| `exportedAt` | ISO 8601 UTC timestamp | When the file was written. |
| `player` | object | See below. |
| `leagues` | array | Every league a character or league record in this file refers to, and no others. |
| `leagueRecords` | array | The player's challenge progress and notes, one per league they recorded. |
| `characters` | array | Every character, oldest league first. |

## `player`

| Field | Type | Meaning |
| --- | --- | --- |
| `username` | string | 3–24 of `[A-Za-z0-9_-]`, unique case-insensitively. The address of every page. |
| `firstName` | string | |
| `tagline` | string \| null | |
| `createdAt` | `YYYY-MM-DD HH:MM:SS` (UTC) | SQLite's `datetime('now')`. |

## League references

A character and a league record point at their league with `{ "game": "poe1" | "poe2", "slug": "…" }`
— the catalogue key, never the patch: both games ship a 1.0, and three events share 3.25. Every
reference resolves to an entry in `leagues`.

## `leagues[]`

The league as this archive held it at export time.

| Field | Type | Meaning |
| --- | --- | --- |
| `game`, `slug` | string | The key. |
| `patch` | string \| null | Null for an event with no patch of its own. |
| `kind` | `"event"` \| null | Null for a challenge league. |
| `parent` | string \| null | The league an event ran inside. |
| `name`, `expansion` | string, string \| null | League name and the content update it shipped with. |
| `startDate`, `endDate` | `YYYY-MM-DD` \| null | |
| `endDateEstimated` | boolean | The end date is a projection, not an announcement. |
| `datesUncertain` | boolean | The dates themselves are unconfirmed. |
| `challengeTotal` | number \| null | Null where the league has no challenges or the count is unknown. |
| `isCustom` | boolean | `false`: a built-in catalogue row, which every instance re-creates from code, so a reader should resolve it by key and take its own catalogue's data. `true`: a league a user added by hand, which a reader must create if it has no row with that key. |

## `leagueRecords[]`

| Field | Type | Meaning |
| --- | --- | --- |
| `league` | league reference | |
| `challengesCompleted` | number \| null | |
| `challengeTotal` | number \| null | The player's override of the league's total; null means use the league's. |
| `notes` | string \| null | |

## `characters[]`

| Field | Type | Meaning |
| --- | --- | --- |
| `league` | league reference | |
| `slug` | string | URL segment, unique per player and league. |
| `name`, `className` | string | `className` may be `"Unknown"` for a hand-written record. |
| `ascendancy`, `mainSkill`, `notes` | string \| null | `"Unknown"` is a placeholder, not a value. |
| `level` | number \| null | |
| `playedMinutes` | number \| null | In-game `/played`, typed in by hand. |
| `isFavorite` | boolean | |
| `pobCode` | string \| null | The Path of Building share code (URL-safe base64 over deflated XML). The source of truth for an imported build. |
| `pobUrl` | string \| null | The link it was imported from, if any. May no longer resolve. |
| `parserVersion` | number | Which parser version wrote `build`. |
| `createdAt` | `YYYY-MM-DD HH:MM:SS` (UTC) | |
| `build` | object | The stored `BuildData` (`src/lib/types.ts`) exactly as held, `{}` if it was unreadable. |

`build` is a cache of the parser. A reader with a newer parser should re-parse from `pobCode` when
there is one, and keep `build` when there is not or the code no longer parses — the same rule the
archive's own `migrate()` follows. A hand-written character has `"source": "manual"` and no code, so
its `build` is all there is.

## Stability

Within version 1, fields are only ever added. A field is never renamed, retyped or removed without
bumping `version`.
