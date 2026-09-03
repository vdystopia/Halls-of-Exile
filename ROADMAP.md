# Roadmap

Working backlog. Claude reads this at the start of a session, so anything written here is
picked up without re-explaining. Move items between sections freely; delete what stops
mattering.

## Now

- [ ] Decide whether the site is renamed **Halls of Exile** to match the repository, or
      stays **Halls of Exile**. Touches the page title, header, footer, compose
      `container_name` and image tag.
- [ ] Populate the archive with the owner's real characters, and note anything the import
      flow makes awkward while doing it — that friction is the best source of the next few
      items here.

## Next

- [ ] Replace 3.29's tentative end date once Grinding Gear Games announces it, and clear
      the `endDateEstimated` flag.
- [ ] Character sorting and filtering on a league page once leagues hold more than a
      handful of characters (by level, class, main skill).
- [ ] Search across a player's whole archive: character name, skill, unique item.
- [ ] Per-player export (JSON) so an archive can be moved or handed over.
- [ ] Weekly backup as a scheduled task on the server rather than a command to remember.

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
- [x] Path of Building import: gear with mod tooltips, gems by socket group, tree summary,
      every computed stat.
- [x] League catalogue 1.0 → 3.29, with challenge totals and per-player challenge records.
- [x] Docker packaging, health endpoint, online backup script.
- [x] Renamed to **Halls of Exile**, matching the repository.
- [x] Per-character `/played` time, summed into the player header.
- [x] `update.ps1`: backup, pull, rebuild, health-check, automatic rollback.
- [x] CI on every push: typecheck, lint, tests, build, and a container that must boot and
      serve before a build is called green.
