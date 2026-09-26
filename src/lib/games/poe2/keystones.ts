import type { KeystoneIcon } from "../poe1/keystones";
import index from "./keystone-icons.json";

const ICONS = index.icons as Record<string, { slug: string }>;

/**
 * A Path of Exile 2 keystone's icon, from its own wiki, in
 * public/keystones/poe2/, in its own game's frame. Ancestral Bond and
 * Resolute Technique are keystones in both games with their own art in each,
 * so this is only ever reached through the character's game.
 */
export function keystoneIcon(name?: string | null): KeystoneIcon | null {
  const entry = name ? ICONS[name.trim()] : undefined;
  if (!entry) return null;
  return {
    src: `/keystones/poe2/${entry.slug}.webp`,
    size: index.size,
    frame: { src: "/keystones/poe2/frame.webp", size: index.frame.size, window: index.frame.window },
  };
}

/** The frame alone — the carved ring every keystone sits in — for anything else drawn in it. */
export function keystoneFrame(): KeystoneIcon["frame"] {
  return { src: `/keystones/poe2/frame.webp`, size: index.frame.size, window: index.frame.window };
}
