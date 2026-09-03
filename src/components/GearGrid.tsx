import { FLASK_SLOTS, GEAR_LAYOUT } from "@/lib/items";
import type { BuildData, ParsedItem } from "@/lib/types";
import { ItemCard } from "./ItemCard";

export function GearGrid({ build }: { build: BuildData }) {
  const byId = new Map<number, ParsedItem>(build.items.map((item) => [item.id, item]));
  const at = (slot: string) => {
    const id = build.slots[slot];
    return id ? byId.get(id) : undefined;
  };

  const placed = new Set<number>();
  for (const slot of Object.keys(build.slots)) {
    const id = build.slots[slot];
    if (id) placed.add(id);
  }
  const loose = build.items.filter((item) => !placed.has(item.id));

  const abyssal = Object.keys(build.slots).filter((slot) => /Abyssal Socket/.test(slot));
  const flasks = FLASK_SLOTS.map((slot) => ({ slot, item: at(slot) })).filter((entry) => entry.item);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        {GEAR_LAYOUT.map((cell) => (
          <ItemCard key={cell.slot} item={at(cell.slot)} label={cell.label} className={cell.pos} />
        ))}
      </div>

      {flasks.length ? (
        <div>
          <p className="eyebrow mb-2">Flasks</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {flasks.map(({ slot, item }) => (
              <ItemCard key={slot} item={item} label={slot} />
            ))}
          </div>
        </div>
      ) : null}

      {abyssal.length ? (
        <div>
          <p className="eyebrow mb-2">Abyssal sockets</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {abyssal.map((slot) => (
              <ItemCard key={slot} item={at(slot)} label={slot.replace(" Abyssal Socket", " · socket")} />
            ))}
          </div>
        </div>
      ) : null}

      {loose.length ? (
        <div>
          <p className="eyebrow mb-2">Jewels &amp; unequipped</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {loose.map((item) => (
              <ItemCard key={item.id} item={item} label={item.rarity.toLowerCase()} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
