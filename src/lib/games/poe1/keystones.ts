import index from "./keystone-icons.json";

export type KeystoneIcon = { src: string; size: number };

const ICONS = index.icons as Record<string, { slug: string }>;

/**
 * A keystone's icon, from the Path of Exile Wiki via `npm run keystones:art`,
 * in public/keystones/poe1/. Null for a name the index lacks — a keystone the
 * wiki has no file for, or a notable given as a keystone — so the panel prints
 * the name alone rather than a broken picture.
 */
export function keystoneIcon(name?: string | null): KeystoneIcon | null {
  const entry = name ? ICONS[name.trim()] : undefined;
  return entry ? { src: `/keystones/poe1/${entry.slug}.webp`, size: index.size } : null;
}
