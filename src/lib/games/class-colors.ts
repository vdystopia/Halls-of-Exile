import type { CSSProperties } from "react";
import type { GameId } from "./types";

type Attribute = "str" | "dex" | "int";

/**
 * Which attributes each class starts on, which is what the game colours by:
 * strength red, dexterity green, intelligence blue, the colours of its gems and
 * sockets. Order is the order the gradient runs in. Kept per game because Witch
 * and Ranger are names in both, and a class the map does not know — "Unknown",
 * or one added after this was written — keeps the page's ordinary gold.
 */
const CLASS_ATTRIBUTES: Record<GameId, Record<string, Attribute[]>> = {
  poe1: {
    Witch: ["int"],
    Templar: ["int", "str"],
    Marauder: ["str"],
    Duelist: ["str", "dex"],
    Ranger: ["dex"],
    Shadow: ["dex", "int"],
    Scion: ["int", "dex", "str"],
  },
  poe2: {
    Warrior: ["str"],
    Mercenary: ["str", "dex"],
    Ranger: ["dex"],
    Huntress: ["dex"],
    Monk: ["dex", "int"],
    Sorceress: ["int"],
    Witch: ["int"],
    Druid: ["int", "str"],
  },
};

/** Each attribute's gem colour: a lit edge, the body, and the stone in shadow. */
const GEM: Record<Attribute, { light: string; base: string; dark: string }> = {
  str: { light: "#ff8f7a", base: "#e2483c", dark: "#9c231c" },
  dex: { light: "#a3eb8c", base: "#55bf4c", dark: "#23782f" },
  int: { light: "#9dbdff", base: "#5584ec", dark: "#2a47ad" },
};

/**
 * The character name's fill, as custom properties for `.gem-name`: one colour
 * runs light to dark, two or three run into each other. The gloss and facet are
 * the stylesheet's; this only chooses the colours under them.
 */
export function classNameStyle(game: GameId, className: string | null | undefined): CSSProperties | undefined {
  const attributes = className ? CLASS_ATTRIBUTES[game][className] : undefined;
  if (!attributes) return undefined;
  const stops =
    attributes.length === 1
      ? [GEM[attributes[0]].light, GEM[attributes[0]].base, GEM[attributes[0]].dark]
      : attributes.map((attribute) => GEM[attribute].base);
  return {
    "--gem-fill": `linear-gradient(100deg, ${stops.join(", ")})`,
    "--gem-glow": GEM[attributes[0]].base,
  } as CSSProperties;
}
