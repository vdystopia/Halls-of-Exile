import index from "./keystone-icons.json";

/**
 * A keystone's picture, and the frame it sits in. The frame is one per game, a
 * carved ring with a transparent window; `window` is that window's width as a
 * fraction of the frame's, so the picture can be drawn to fill it with its
 * corners under the ring, the way the game draws it.
 */
export type KeystoneIcon = {
  src: string;
  size: number;
  frame: { src: string; size: number; window: number };
};

const ICONS = index.icons as Record<string, { slug: string }>;

/**
 * A keystone's icon, from the Path of Exile Wiki via `npm run keystones:art`,
 * in public/keystones/poe1/. Null for a name the index lacks — a keystone the
 * wiki has no file for, or a notable given as a keystone — so the panel prints
 * the name alone rather than a broken picture.
 */
export function keystoneIcon(name?: string | null): KeystoneIcon | null {
  const entry = name ? ICONS[name.trim()] : undefined;
  if (!entry) return null;
  return {
    src: `/keystones/poe1/${entry.slug}.webp`,
    size: index.size,
    frame: { src: "/keystones/poe1/frame.webp", size: index.frame.size, window: index.frame.window },
  };
}

/** The frame alone — the carved ring every keystone sits in — for anything else drawn in it. */
export function keystoneFrame(): KeystoneIcon["frame"] {
  return { src: `/keystones/poe1/frame.webp`, size: index.frame.size, window: index.frame.window };
}
