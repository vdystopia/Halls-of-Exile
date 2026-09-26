import { gearFor } from "@/lib/games/gear";
import type { GameId } from "@/lib/games/types";
import type { BuildData, ParsedItem } from "@/lib/types";
import { GearSlot } from "./gear/GearSlot";
import type { SlotEdit } from "./gear/SlotPaste";

/** One square of the paper doll. Tiles are sized from this. */
const CELL = "clamp(44px, 7.2vw, 76px)";
const GAP = "6px";

/** Where pastes into this doll go: the character, and what is pasted in each slot now. */
export type GearEdit = { username: string; game: string; league: string; character: string; slotItems: Record<string, string> };

export function GearGrid({ build, game, edit }: { build: BuildData; game: GameId; edit?: GearEdit }) {
  // The doll, the art and the tooltip are the character's own game's: the two
  // games share base names and not the pictures or numbers behind them.
  const { doll: PAPER_DOLL, columns: DOLL_COLUMNS, flaskSlots: FLASK_SLOTS, art, tooltip } = gearFor(game);
  const byId = new Map<number, ParsedItem>(build.items.map((item) => [item.id, item]));
  const at = (slot: string) => {
    const id = build.slots[slot];
    return id ? byId.get(id) : undefined;
  };
  // Both resolved on the server, so neither the art catalogue nor the block and
  // requirement arithmetic that reads it reaches the browser.
  const artFor = (item?: ParsedItem) => (item ? art(item) : null);
  const tooltipFor = (item?: ParsedItem) => (item ? tooltip(item) : undefined);
  // Every slot on the doll takes a paste; a tree jewel is an item, not a slot.
  const editFor = (slot: string): SlotEdit | undefined =>
    edit ? { ...edit, slot, pasted: edit.slotItems[slot] ?? null } : undefined;

  // Path of Building keeps every item a build has ever held in one list, so an
  // item is only shown if the build actually uses it: equipped in a slot, or
  // socketed into the passive tree. The rest are spares and are not gear.
  const placed = new Set(Object.values(build.slots).filter(Boolean));
  const socketed = (build.treeJewels ?? []).filter((id) => !placed.has(id));
  const jewels = socketed.map((id) => byId.get(id)).filter((item): item is ParsedItem => Boolean(item));
  const abyssal = Object.keys(build.slots).filter((slot) => /Abyssal Socket/.test(slot));

  // Slots the paper doll has no cell for but the character is genuinely wearing:
  // the weapon swap set, a heist trinket, anything a source names that this one
  // does not know. Drawn beneath the doll rather than dropped.
  const drawn = new Set([...PAPER_DOLL.map((cell) => cell.slot), ...FLASK_SLOTS, ...abyssal]);
  const extras = Object.keys(build.slots).filter((slot) => !drawn.has(slot));

  return (
    <div className="space-y-5">
      <div
        className="mx-auto grid w-fit"
        style={{
          gridTemplateColumns: `repeat(${DOLL_COLUMNS}, ${CELL})`,
          gridAutoRows: CELL,
          gap: GAP,
        }}
      >
        {PAPER_DOLL.map((cell) => (
          <GearSlot
            key={cell.slot}
            item={at(cell.slot)}
            art={artFor(at(cell.slot))}
            tooltip={tooltipFor(at(cell.slot))}
            shape={cell.shape}
            label={cell.label}
            edit={editFor(cell.slot)}
            style={{ gridColumn: cell.column, gridRow: cell.row }}
          />
        ))}
        {FLASK_SLOTS.map((slot, index) => (
          <GearSlot
            key={slot}
            item={at(slot)}
            art={artFor(at(slot))}
            tooltip={tooltipFor(at(slot))}
            shape="flask"
            label={slot}
            edit={editFor(slot)}
            style={{ gridColumn: String(index + 1), gridRow: "7 / span 2" }}
          />
        ))}
      </div>

      {extras.length ? (
        <div>
          <p className="eyebrow mb-2">Also equipped</p>
          <div className="flex flex-wrap gap-1.5">
            {extras.map((slot) => (
              <GearSlot
                key={slot}
                item={at(slot)}
                art={artFor(at(slot))}
                tooltip={tooltipFor(at(slot))}
                shape={/Weapon 2|Offhand/.test(slot) ? "offhand" : /Weapon/.test(slot) ? "weapon" : "jewel"}
                label={slot}
                edit={editFor(slot)}
                style={{ width: CELL, height: CELL }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {abyssal.length ? (
        <div>
          <p className="eyebrow mb-2">Abyssal sockets</p>
          <div className="flex flex-wrap gap-1.5">
            {abyssal.map((slot) => (
              <GearSlot
                key={slot}
                item={at(slot)}
                art={artFor(at(slot))}
                tooltip={tooltipFor(at(slot))}
                shape="jewel"
                label={slot}
                edit={editFor(slot)}
                style={{ width: CELL, height: CELL }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {jewels.length ? (
        <div>
          <p className="eyebrow mb-2">Tree jewels</p>
          <div className="flex flex-wrap gap-1.5">
            {jewels.map((item) => (
              <GearSlot
                key={item.id}
                item={item}
                art={artFor(item)}
                tooltip={tooltipFor(item)}
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
