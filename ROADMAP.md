# Roadmap

Working backlog. Claude reads this at the start of a session, so anything written here is
picked up without re-explaining. Move items between sections freely; delete what stops
mattering.

## Now

- [ ] Populate the archive with the owner's real characters, and note anything the import
      flow makes awkward while doing it — that friction is the best source of the next few
      items here.

## Next

- [ ] Replace 3.29's tentative end date once Grinding Gear Games announces it, and clear
      the `endDateEstimated` flag.
- [ ] Import a player export (`docs/export-format.md`) into another instance: the other half of
      moving an archive. Resolve built-in leagues by `(game, slug)`, create custom ones, re-parse
      from `pobCode` where the reader's parser is newer.
- [ ] Move the archive to pc2 (README, "Moving the archive from the Windows server"), point the
      reverse proxy at `halls-of-exile:3000` on the `proxy` network, and have the nightly host
      backup job call `backup.sh` before it snapshots. Then retire the Windows instance.

## Later

- [ ] `ARCHIVE_READONLY=1` mode: public browsing, edits locked off. Only needed if the
      site is ever exposed beyond the LAN.
- [ ] Render the passive tree rather than linking out to it. Needs the tree node data for
      each tree version — a significant amount of data to carry.
- [ ] Import a character straight from a PoE account name, skipping Path of Building.
      Depends on the official API and on characters being public.
- [ ] League timeline view: every league on one axis, characters plotted against it.
- [ ] Compare two characters side by side.

## Done

- [x] Player profiles, public directory, league index, league pages, character sheets.
- [x] Path of Building import: gems by socket group, tree summary, every computed stat.
- [x] Gear laid out as Path of Exile's paper doll, with in-game-style hover tooltips.
- [x] League catalogue 1.0 → 3.29, with challenge totals and per-player challenge records.
- [x] Docker packaging, health endpoint, online backup script.
- [x] Renamed to **Halls of Exile**, matching the repository.
- [x] Character sorting and filtering on a league page (level, name, class, main skill,
      /played, date added), kept in the query string.
- [x] Search across a player's whole archive: character name, skill, unique item in use.
- [x] Per-player JSON export, versioned and documented in `docs/export-format.md`.
- [x] Per-character `/played` time, summed into the player header.
- [x] `update.ps1`: backup, pull, rebuild, health-check, automatic rollback.
- [x] Linux deploy path for pc2: `update.sh`, `backup.sh` for the nightly host job, and
      `docker-compose.pc2.yml` (bind-mounted data, no host port, external `proxy` network).
- [x] CI on every push: typecheck, lint, tests, build, and a container that must boot and
      serve before a build is called green.
