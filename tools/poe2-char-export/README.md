# poe2-char-export

Exports every Path of Exile 2 character on your account, with its equipped gear, to one JSON file.
The archive's import page (`/players/<you>/import`) reads that file.

## Run it

1. Log in at <https://pathofexile2.com> and open **My Account → Characters**
   (`/my-account/characters`). Opening this page is what gives the session access to character data.
2. Open DevTools and go to Sources → Snippets → New snippet. Paste `poe2-char-export.js` and run it
   with Ctrl+Enter. It saves `poe2-characters-<account>-<date>.json` to Downloads, pausing 8 seconds
   between requests. Thirteen characters take about two minutes.
3. Upload that file on the archive's import page. Characters already in the archive get their gear
   filled in. A character the archive has never seen needs a league picked for it.

Claude in Chrome can do steps 1–2 for you.

## What the file holds, and what it cannot

These are observed facts from 2026-09-25. The full investigation is in the handoff this was built
from.

| Data | Source |
|---|---|
| Characters: name, level, current league, last login, ascendancy id (`Monk3`) | `GET /internal-api/my-account/characters?realm=poe2` |
| Equipped items: both weapon sets, flasks and charms, runes, soul cores and idols in their sockets, skills an item grants and their supports | `GET /internal-api/my-account/character/<id>?realm=poe2` |
| Passive tree, weapon-set passives, tree jewels, skill gems in skill slots | **Not on this site.** Only the official OAuth API (`/character/poe2/<name>`) serves them, and GGG is not registering new applications. Path of Building 2 has access: import the character there and paste its share code into the archive. |

- **Login required.** Both endpoints need the session cookie *and* an `Authorization: DPoP <token>`
  header taken from `localStorage.__POESESSION`. Either one alone gets a 401. There is no public
  PoE2 profile, so this only ever reads your own account.
- **Rate limits.** None were advertised in 34 calls. The script paces itself anyway, and honours
  `Retry-After` / `X-Rate-Limit-*` if they ever appear.
- **Exact copies.** Every response is stored under each character's `raw`, exactly as it arrived.
  The archive keeps it with the character, so a later fix to the mapping can re-read it without
  exporting again.
- **League.** The league in the file is where the character is now. A character in Standard might
  have been played anywhere. The archive only treats the league as certain when the character is
  still in a running league. Otherwise it grades a guess from the last login, and you choose.

## Passive tree data

The site's tree (`/internal-api/content/game-passive-skill-tree`) is public, but it has no version:
each patch replaces it. `npm run tree:poe2:snapshot` saves a copy whenever it has changed, so a
character can later be drawn on the tree it was played on.
