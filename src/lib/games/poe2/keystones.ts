import type { KeystoneIcon } from "../poe1/keystones";
import index from "./keystone-icons.json";

const ICONS = index.icons as Record<string, { slug: string }>;

/**
 * A Path of Exile 2 keystone's icon, from its own wiki, in
 * public/keystones/poe2/. Ancestral Bond and Resolute Technique are keystones
 * in both games with their own art in each, so this is only ever reached
 * through the character's game.
 */
export function keystoneIcon(name?: string | null): KeystoneIcon | null {
  const entry = name ? ICONS[name.trim()] : undefined;
  return entry ? { src: `/keystones/poe2/${entry.slug}.webp`, size: index.size } : null;
}
