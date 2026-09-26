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
 * The colours a class is painted with where a solid or a gradient is wanted
 * rather than a text fill — a legend swatch. One attribute is its gem's body
 * colour; two or three run into each other in the order the class starts on
 * them, the same run the name's gradient makes. A class the map does not know
 * gets the page's muted stone, so "Unknown" is never mistaken for a class.
 */
export function classSwatch(game: GameId, className: string | null | undefined): string[] {
  const attributes = className ? CLASS_ATTRIBUTES[game][className] : undefined;
  if (!attributes) return ["#8b8272"];
  return attributes.map((attribute) => GEM[attribute].base);
}

/**
 * The passive tree's ring, clockwise from the top: intelligence at twelve,
 * dexterity at four, strength at eight, with each hybrid class between the two
 * attributes it shares. Path of Exile's classes sit on it as Witch, Shadow,
 * Ranger, Duelist, Marauder, Templar; Path of Exile 2's classes take the same
 * places by their attributes, two to a pure attribute. A three-attribute class
 * (Scion, at the tree's centre) and an unknown class come last, between the
 * int/str hybrid and the top.
 */
const RING = ["int", "dex+int", "dex", "dex+str", "str", "int+str", "dex+int+str"];

const signature = (game: GameId, className: string | null | undefined) => {
  const attributes = className ? CLASS_ATTRIBUTES[game][className] : undefined;
  return attributes ? [...attributes].sort().join("+") : null;
};

/**
 * The classes in the tree's clockwise order, and which of them are the pure
 * intelligence classes that sit at the top — the pie centres those at twelve
 * o'clock. Classes the ring does not know keep their given order at the end.
 */
export function classRingOrder(game: GameId, names: string[]): { order: string[]; top: string[] } {
  const rank = (name: string) => {
    const at = RING.indexOf(signature(game, name) ?? "");
    return at < 0 ? RING.length : at;
  };
  const order = names
    .map((name, index) => ({ name, index, rank: rank(name) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.name);
  return { order, top: order.filter((name) => signature(game, name) === "int") };
}

/** How a class's slice of the ring is painted. */
export type ClassFill =
  | { kind: "solid"; light: string; base: string; dark: string }
  /** A hybrid runs from the colour of the neighbour before it (clockwise) into the one after. */
  | { kind: "run"; stops: string[] }
  | { kind: "stone" };

/**
 * The run a hybrid makes follows the ring: dex/int sits between int and dex,
 * so it runs int→dex clockwise; str/dex runs dex→str; int/str runs str→int.
 * The three-attribute class runs through all three. So laid side by side the
 * slices make one continuous wheel, each solid class's colour flowing through
 * the hybrid beside it into the next.
 */
const RUNS: Record<string, Attribute[]> = {
  "dex+int": ["int", "dex"],
  "dex+str": ["dex", "str"],
  "int+str": ["str", "int"],
  "dex+int+str": ["int", "dex", "str"],
};

export function classFill(game: GameId, className: string | null | undefined): ClassFill {
  const key = signature(game, className);
  if (!key) return { kind: "stone" };
  const run = RUNS[key];
  if (run) return { kind: "run", stops: run.map((attribute) => GEM[attribute].base) };
  const gem = GEM[key as Attribute];
  return { kind: "solid", light: gem.light, base: gem.base, dark: gem.dark };
}

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
