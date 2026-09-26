import { parseClipboardItem } from "./games/shared/clipboard";
import type { BuildData } from "./types";

/**
 * Items pasted into the paper doll by hand, one per slot, kept as the text the
 * game copied (`characters.slot_items`, a JSON object of slot → text).
 *
 * They live beside the build rather than in it because the stored build is a
 * cache of the parser: `reparseStaleBuilds` rewrites it from the share code or
 * the export whenever a parser moves, and anything written into it by hand
 * would go with it. Kept apart, a pasted item survives every re-parse and
 * never overwrites what a source said — it is laid over the build each time
 * the page reads it, taking the slot and displacing whatever was in it.
 */
export type SlotItems = Record<string, string>;

/** Ids for pasted items, far above anything a share code or export numbers. */
const PASTED_ID_BASE = 900_000;

export function parseSlotItems(stored: string | null | undefined): SlotItems {
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, text]) => typeof text === "string" && text.trim()),
    ) as SlotItems;
  } catch {
    return {};
  }
}

/**
 * The build with the pasted items in their slots. An item that was in a slot
 * a paste takes over leaves the item list too, unless it is also socketed in
 * the tree or worn elsewhere — it was displaced, not kept as a spare. A paste
 * that no longer reads is skipped rather than shown broken.
 */
export function applySlotItems(build: BuildData, slotItems: SlotItems): BuildData {
  const entries = Object.entries(slotItems);
  if (!entries.length) return build;
  const slots = { ...build.slots };
  const displaced = new Set<number>();
  const pasted = [];
  for (const [index, [slot, text]] of entries.entries()) {
    try {
      const item = parseClipboardItem(text, PASTED_ID_BASE + index);
      item.slot = slot;
      const previous = slots[slot];
      if (previous) displaced.add(previous);
      slots[slot] = item.id;
      pasted.push(item);
    } catch {
      continue;
    }
  }
  const stillUsed = new Set([...Object.values(slots), ...(build.treeJewels ?? [])]);
  const items = build.items.filter((item) => !displaced.has(item.id) || stillUsed.has(item.id));
  return { ...build, items: [...items, ...pasted], slots };
}
