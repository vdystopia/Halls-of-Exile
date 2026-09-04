"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { rarityClass } from "@/lib/items";
import type { ParsedItem } from "@/lib/types";
import { ItemTooltip } from "./ItemTooltip";
import { SlotIcon, type SlotShape } from "./SlotIcon";

const RARITY_BORDER: Record<string, string> = {
  NORMAL: "#c8c8c8",
  MAGIC: "#8888ff",
  RARE: "#ffff77",
  UNIQUE: "#af6025",
  RELIC: "#af6025",
};

export function GearSlot({
  item,
  shape,
  label,
  style,
}: {
  item?: ParsedItem;
  shape: SlotShape;
  label: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const tile = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);

  // Sit beside the slot, flipping to the other side and clamping to the
  // viewport rather than being clipped — the way the game places tooltips.
  useLayoutEffect(() => {
    if (!open || !tile.current || !tip.current) return;
    const anchor = tile.current.getBoundingClientRect();
    const panel = tip.current.getBoundingClientRect();
    const gap = 12;

    let left = anchor.right + gap;
    if (left + panel.width > window.innerWidth - 8) left = anchor.left - panel.width - gap;
    if (left < 8) left = Math.max(8, (window.innerWidth - panel.width) / 2);

    let top = anchor.top;
    if (top + panel.height > window.innerHeight - 8) top = window.innerHeight - panel.height - 8;
    if (top < 8) top = 8;

    setCoords({ left, top });
    setPlaced(true);
  }, [open]);

  const show = () => {
    setPlaced(false);
    setOpen(true);
  };
  const hide = () => setOpen(false);
  const border = item ? (RARITY_BORDER[item.rarity.toUpperCase()] ?? RARITY_BORDER.NORMAL) : null;

  return (
    <>
      <div
        ref={tile}
        style={style}
        tabIndex={item ? 0 : -1}
        aria-label={item ? `${label}: ${item.name}` : `${label}: empty`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={`group relative flex items-center justify-center rounded-sm border transition-colors outline-none ${
          item
            ? "border-line bg-surface-2/60 hover:bg-surface-3/70 focus-visible:bg-surface-3/70"
            : "border-dashed border-line/60 bg-black/20"
        }`}
      >
        <SlotIcon
          shape={shape}
          className={`h-[60%] w-[60%] ${item ? `${rarityClass(item.rarity)} opacity-55 transition-opacity group-hover:opacity-90 group-focus-visible:opacity-90` : "text-muted/20"}`}
        />
        {item ? (
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] opacity-0 transition-opacity group-hover:opacity-90 group-focus-visible:opacity-90"
            style={{ background: border ?? undefined }}
          />
        ) : null}
      </div>

      {open && item
        ? createPortal(
            <div
              ref={tip}
              className="pointer-events-none fixed z-[120]"
              style={{ left: coords.left, top: coords.top, opacity: placed ? 1 : 0 }}
            >
              <ItemTooltip item={item} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
