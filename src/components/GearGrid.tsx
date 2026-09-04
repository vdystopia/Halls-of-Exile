import { FLASK_SLOTS, PAPER_DOLL } from "@/lib/items";
import type { BuildData, ParsedItem } from "@/lib/types";
import { GearSlot } from "./gear/GearSlot";

/** One square of the paper doll. Tiles are sized from this. */
const CELL = "clamp(34px, 5.4vw, 58px)";
const GAP = "6px";

export function GearGrid({ build }: { build: BuildData }) {
  const byId = new Map<number, ParsedItem>(build.items.map((item) => [item.id, item]));
  const at = (slot: string) => {
    const id = build.slots[slot];
    return id ? byId.get(id) : undefined;
  };

  const placed = new Set(Object.values(build.slots).filter(Boolean));
  const loose = build.items.filter((item) => !placed.has(item.id));
  const abyssal = Object.keys(build.slots).filter((slot) => /Abyssal Socket/.test(slot));

  return (
    <div className="space-y-5">
      <div
        className="mx-auto grid w-fit"
        style={{
          gridTemplateColumns: `repeat(8, ${CELL})`,
          gridAutoRows: CELL,
          gap: GAP,
        }}
      >
        {PAPER_DOLL.map((cell) => (
          <GearSlot
            key={cell.slot}
            item={at(cell.slot)}
            shape={cell.shape}
            label={cell.label}
            style={{ gridColumn: cell.column, gridRow: cell.row }}
          />
        ))}
        {FLASK_SLOTS.map((slot, index) => (
          <GearSlot
            key={slot}
            item={at(slot)}
            shape="flask"
            label={slot}
            style={{ gridColumn: String(index + 2), gridRow: "7 / span 2" }}
          />
        ))}
      </div>

      {abyssal.length ? (
        <div>
          <p className="eyebrow mb-2">Abyssal sockets</p>
          <div className="flex flex-wrap gap-1.5">
            {abyssal.map((slot) => (
              <GearSlot
                key={slot}
                item={at(slot)}
                shape="jewel"
                label={slot}
                style={{ width: CELL, height: CELL }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {loose.length ? (
        <div>
          <p className="eyebrow mb-2">Jewels &amp; unequipped</p>
          <div className="flex flex-wrap gap-1.5">
            {loose.map((item) => (
              <GearSlot
                key={item.id}
                item={item}
                shape="jewel"
                label={item.name}
                style={{ width: CELL, height: CELL }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
