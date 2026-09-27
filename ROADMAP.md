# Roadmap

Working backlog. Claude reads this at the start of a session, so anything written here is
picked up without re-explaining. Move items between sections freely; delete what stops
mattering.

The versions are the owner's (2026-09-27). The dashboard is the product; filling it with
characters is the player's own job and is never what a version waits on.

## 1.0 — released 2026-09-27 (`v1.0.0`)

Everything a single household archive needs, verified against a populated copy of the
archive: profiles, the league index, league pages, character sheets with gear, gems and the
passive tree for both games, the spreadsheet and account imports that never overwrite a
finished character, backup and restore, deploy with rollback, CI with a container boot.

## 1.1 — the household's complete dashboard

Done when every character of both players is in the deployed archive at the tier it can
reach, and nothing about getting them there was awkward enough to write down here.

- [ ] Upload the owner's spreadsheet, then both accounts' exports, and note every point of
      friction the import flow has. That friction is the backlog for the point releases.
- [ ] Weekly backup as a scheduled task on the server rather than a command to remember.
      Backups happen only on deploy today, and deploys are rare now.
- [ ] Replace 3.29's tentative end date once Grinding Gear Games announces it, and clear
      the `endDateEstimated` flag.

## 1.2 – 1.4 — incremental feature and aesthetic improvements

Small releases, each one thing the household actually missed. Candidates, none committed:

- [ ] Character sorting and filtering on a league page once leagues hold more than a
      handful of characters (by level, class, main skill).
- [ ] League timeline view: every league on one axis, characters plotted against it.
- [ ] Compare two characters side by side.

Declined, do not re-propose: search across the archive, per-player JSON export, automatic
deploys, inactive Path of Building item sets, Path of Exile 2 external links.

## 1.5 — packaged for a friend

A second household runs its own copy. He links his account and ports his characters into
his own local archive without the owner's help.

- [ ] One-command install on a machine that has Docker and nothing else: a published image
      rather than a source build, and a compose file that needs no editing.
- [ ] First-run setup in the browser: create the player and link the account there, so
      `src/lib/accounts.ts` stops being the only way an account is known on boot.
- [ ] The collector runs on his machine against his own archive: `collect.ps1` packaged with
      the install, pointed at his instance, scheduled once.
- [ ] Porting: an import of the whole account creates characters in leagues chosen once, in
      bulk, rather than one league prompt per unseen character.
- [ ] `ARCHIVE_READONLY=1` mode: public browsing, edits locked off, for a copy that is ever
      exposed beyond a LAN.

## Later

- [ ] Import a character straight from a PoE account name, skipping Path of Building.
      Depends on the official API and on characters being public.

## Done before 1.0

- [x] Player profiles, public directory, league index, league pages, character sheets.
- [x] Path of Building import: gems by socket group, tree summary, every computed stat.
- [x] Gear laid out as Path of Exile's paper doll, with in-game-style hover tooltips.
- [x] League catalogue 1.0 → 3.29 and 0.1 → 0.5.5, with challenge totals and per-player
      challenge records.
- [x] The passive tree drawn on the page, per version, for both games, with cluster jewels,
      masteries, runegrafts and tattoos.
- [x] Docker packaging, health endpoint, online backup script, restore script.
- [x] `update.ps1`: backup, pull, rebuild, health-check, automatic rollback.
- [x] CI on every push: typecheck, lint, tests, build, and a container that must boot and
      serve before a build is called green.
- [x] Path of Exile 2: site export, Path of Building 2 codes, its own art, tree and classes.
- [x] Unattended collection that fills gear and never overwrites a finished character.
