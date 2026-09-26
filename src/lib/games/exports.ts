import type { BuildData } from "../types";
import {
  buildFromPoeExport,
  POE_API_VERSION,
  PoeExportError,
  readPoeExport,
  rebuildFromStoredExport,
  storedPayload,
  type PoeExport,
  type PoeExportCharacter,
  type StoredPoeExport,
} from "./poe1/poe-api";
import {
  buildFromPoe2Export,
  POE2_SITE_VERSION,
  readPoe2Export,
  rebuildFromStoredPoe2,
  storedPoe2Payload,
  type StoredPoe2Export,
} from "./poe2/site-export";
import type { GameId } from "./types";

/**
 * An account export from either game, read by that game's own mapper. The two
 * files are different shapes from different sites — Path of Exile 1's from the
 * anonymous character-window endpoints, Path of Exile 2's from the logged-in
 * site — and the file says which it is: a Path of Exile 2 export carries
 * `"game": "poe2"`, and the Path of Exile 1 collector's never has.
 *
 * Everything past reading is shared: matching by name within the game, the
 * never-overwrite rule, the league chosen by hand. So the import flow asks this
 * module and never branches on the game itself.
 */
export type AccountExport = PoeExport & {
  game: GameId;
  /** Characters in the file that could not be read, by name, so the page can say so. */
  skippedCharacters: string[];
  /**
   * Characters the file holds nothing for — no items, no skills, no passives:
   * a character stripped for the next league, or one never geared. Importing
   * one would write an empty build and mark it as archived, and every later
   * import would then skip it as finished. So they are left out, and named.
   */
  emptyCharacters: string[];
};

export { PoeExportError };

export function readAccountExport(text: string): AccountExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PoeExportError("That file is not JSON.");
  }
  const read: Omit<AccountExport, "emptyCharacters"> =
    (parsed as { game?: unknown })?.game === "poe2"
      ? { ...readPoe2Export(parsed), game: "poe2" }
      : { ...readPoeExport(text), game: "poe1", skippedCharacters: [] };
  const exported: AccountExport = { ...read, emptyCharacters: [] };
  const kept = exported.characters.filter((character) => !isEmptyBuild(buildFromExport(character, exported)));
  exported.emptyCharacters = exported.characters.filter((character) => !kept.includes(character)).map((c) => c.name);
  exported.characters = kept;
  return exported;
}

/** A build that records nothing: no item, no skill and no allocated passive. */
export function isEmptyBuild(build: BuildData): boolean {
  return (
    build.items.length === 0 &&
    build.skillGroups.length === 0 &&
    !build.trees.some((tree) => (tree.nodes?.length ?? 0) > 0)
  );
}

export function buildFromExport(character: PoeExportCharacter, exported: AccountExport): BuildData {
  return exported.game === "poe2" ? buildFromPoe2Export(character, exported) : buildFromPoeExport(character, exported);
}

export function storedPayloadFor(character: PoeExportCharacter, exported: AccountExport): object {
  return exported.game === "poe2" ? storedPoe2Payload(character, exported) : storedPayload(character, exported);
}

/**
 * The mapper version a build from this source is current at. The two mappers
 * move independently and share the `api_version` column, so the build's own
 * `source` says which one's version applies.
 */
export function exportVersion(source: BuildData["source"] | string | null): number {
  return source === "poe2-site" ? POE2_SITE_VERSION : POE_API_VERSION;
}

/** The build sources that come from an account export, rather than a share code or a form. */
export function isExportSource(source: string | null): boolean {
  return source === "poe-api" || source === "poe2-site";
}

/** Re-derive a stored payload through the mapper that wrote it. */
export function rebuildFromStored(stored: StoredPoeExport | StoredPoe2Export): BuildData {
  return (stored as StoredPoe2Export).game === "poe2"
    ? rebuildFromStoredPoe2(stored as StoredPoe2Export)
    : rebuildFromStoredExport(stored as StoredPoeExport);
}
