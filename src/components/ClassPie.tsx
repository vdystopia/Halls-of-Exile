"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { PieSlice } from "@/lib/pie";

/** One class on the pie, resolved on the server: its share and its ascendancies. */
export type PieClass = {
  name: string;
  /** False for the "Unknown class" bucket, drawn in stone rather than a class colour. */
  known: boolean;
  characters: number;
  /** The class's colour stops: one for a single attribute, two or three for a hybrid. */
  swatch: string[];
  ascendancies: { name: string; characters: number; known: boolean }[];
};

/** The chart's own coordinates; it scales to its box. The slices were laid out in these by ClassBreakdown. */
const SIZE = 240;
/** About what one character of the 10px label costs, in the chart's units, plus a margin either side. */
const GLYPH = 5.6;
const LABEL_MARGIN = 6;
/** Two labels closer than this, centre to centre, would overprint. */
const LABEL_CLEARANCE = { x: 46, y: 14 };
/** The flyout's width, which its left edge is clamped against. */
const FLYOUT_WIDTH = 224;

const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * Which slices carry their own name. A slice does when the name fits in the
 * room the wedge offers at the label point and no label already placed sits
 * where it would overprint; the rest are named by the legend and the flyout.
 * Decided once per render, in slice order, so the wider slices win.
 */
function labelled<T extends { item: { name: string }; label: { x: number; y: number }; room: number }>(slices: T[]): Set<number> {
  const placed: { x: number; y: number }[] = [];
  const chosen = new Set<number>();
  slices.forEach((slice, index) => {
    const needed = slice.item.name.length * GLYPH + LABEL_MARGIN;
    if (slice.room < needed) return;
    const collides = placed.some(
      (at) => Math.abs(at.x - slice.label.x) < LABEL_CLEARANCE.x && Math.abs(at.y - slice.label.y) < LABEL_CLEARANCE.y,
    );
    if (collides) return;
    placed.push(slice.label);
    chosen.add(index);
  });
  return chosen;
}

/**
 * A player's characters by class, as a pie beside the class table: the whole at
 * a glance where the table has the figures. Colour is each class's own, the one
 * its name is written in everywhere else; a hybrid class runs its two
 * attributes into each other. Slices are parted by a hair of the panel's
 * surface, those with room carry their name, and the legend beneath names them
 * all with counts, so which slice is which never rests on colour alone.
 *
 * Resting on a slice or a legend row, or tabbing to a slice, opens a flyout
 * with the class's ascendancies and how many characters took each. The flyout
 * is portalled to the body and fixed beside the pointer, above it when the
 * pointer is in the lower half of the window; Escape closes it, and it is the
 * focused slice's description for a screen reader.
 */
export function ClassPie({ slices, total, game }: { slices: PieSlice<PieClass>[]; total: number; game: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  // What opened it: a scroll closes a pointer-opened flyout (a tap on touch has
  // no other way out), but focusing a slice scrolls it into view first, and a
  // keyboard-opened flyout must survive that.
  const [via, setVia] = useState<"pointer" | "focus">("pointer");
  const gradientId = useId();
  const flyoutId = useId();

  const show = (index: number, at?: { x: number; y: number }, by: "pointer" | "focus" = "pointer") => {
    setActive(index);
    setVia(by);
    if (at) setPointer(at);
  };
  const hide = () => {
    setActive(null);
    setPointer(null);
  };
  const current = active === null ? null : slices[active];

  // A tap on touch opens the flyout with nothing to close it; scrolling away does.
  useEffect(() => {
    if (active === null || via !== "pointer") return;
    const off = () => hide();
    window.addEventListener("scroll", off, { passive: true });
    return () => window.removeEventListener("scroll", off);
  }, [active, via]);

  const named = labelled(slices);
  const summary = slices.map((slice) => `${slice.item.name} ${slice.value} (${percent(slice.share)})`).join(", ");

  const flyout =
    current && pointer && typeof window !== "undefined"
      ? createPortal(
          <div
            id={flyoutId}
            role="tooltip"
            className="pointer-events-none fixed z-[120] rounded border border-line bg-surface-2 p-3 text-xs shadow-lg shadow-black/60"
            style={{
              width: FLYOUT_WIDTH,
              left: Math.max(8, Math.min(pointer.x + 14, window.innerWidth - FLYOUT_WIDTH - 8)),
              // Below the pointer in the top half of the window, above it in the
              // bottom half, so the ascendancy list is never cut off by the fold.
              ...(pointer.y > window.innerHeight / 2
                ? { bottom: window.innerHeight - pointer.y + 12 }
                : { top: Math.max(8, pointer.y - 12) }),
            }}
          >
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-display tracking-wide text-gold-bright">{current.item.name}</span>
              <span className="text-muted tabular-nums">
                {current.value} · {percent(current.share)}
              </span>
            </p>
            <ul className="mt-2 space-y-0.5 border-t border-line pt-2">
              {current.item.ascendancies.map((ascendancy) => (
                <li key={ascendancy.name} className="flex items-baseline justify-between gap-3">
                  <span className={ascendancy.known ? "text-parchment/85" : "text-muted"}>{ascendancy.name}</span>
                  <span className="text-muted tabular-nums">
                    {ascendancy.characters} · {percent(ascendancy.characters / current.value)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-muted">{game}</p>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex flex-col items-center gap-4 pt-2">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Characters by class: ${summary}`}
        className="w-full max-w-[280px]"
        onMouseLeave={hide}
        onKeyDown={(event) => {
          if (event.key === "Escape") hide();
        }}
      >
        <defs>
          {slices.map((slice, index) =>
            slice.item.swatch.length > 1 ? (
              <linearGradient key={index} id={`${gradientId}-${index}`} x1="0" y1="0" x2="1" y2="1">
                {slice.item.swatch.map((stop, at) => (
                  <stop key={at} offset={`${(at / (slice.item.swatch.length - 1)) * 100}%`} stopColor={stop} />
                ))}
              </linearGradient>
            ) : null,
          )}
        </defs>
        {slices.map((slice, index) => {
          const fill = slice.item.swatch.length > 1 ? `url(#${gradientId}-${index})` : slice.item.swatch[0];
          const dimmed = active !== null && active !== index;
          return (
            <path
              key={slice.item.name}
              d={slice.path}
              fill={fill}
              // A hair of surface between slices, so adjacent colours never touch.
              stroke="#131110"
              strokeWidth={2}
              strokeLinejoin="round"
              opacity={dimmed ? 0.45 : 1}
              tabIndex={0}
              aria-label={`${slice.item.name}: ${slice.value} of ${total} characters, ${percent(slice.share)}`}
              aria-describedby={active === index ? flyoutId : undefined}
              onMouseEnter={(event) => show(index, { x: event.clientX, y: event.clientY })}
              onMouseMove={(event) => setPointer({ x: event.clientX, y: event.clientY })}
              onMouseLeave={hide}
              onFocus={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                show(index, { x: box.left + box.width / 2, y: box.top + box.height / 2 }, "focus");
              }}
              onBlur={hide}
              className="cursor-default outline-none transition-opacity focus-visible:stroke-gold"
            />
          );
        })}
        {slices.map((slice, index) =>
          named.has(index) ? (
            <text
              key={`label-${slice.item.name}`}
              x={slice.label.x}
              y={slice.label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="pointer-events-none fill-white text-[10px] font-medium"
              style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 2.5 }}
            >
              {slice.item.name}
            </text>
          ) : null,
        )}
      </svg>

      <ul className="grid w-full max-w-[320px] grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {slices.map((slice, index) => (
          <li
            key={slice.item.name}
            className={`flex items-center gap-2 transition-opacity ${active !== null && active !== index ? "opacity-50" : ""}`}
            onMouseEnter={(event) => show(index, { x: event.clientX, y: event.clientY })}
            onMouseMove={(event) => setPointer({ x: event.clientX, y: event.clientY })}
            onMouseLeave={hide}
          >
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{
                background:
                  slice.item.swatch.length > 1 ? `linear-gradient(135deg, ${slice.item.swatch.join(", ")})` : slice.item.swatch[0],
              }}
            />
            <span className={`truncate ${slice.item.known ? "text-parchment/85" : "text-muted"}`}>{slice.item.name}</span>
            <span className="ml-auto shrink-0 text-muted tabular-nums whitespace-nowrap">
              {slice.value} · {percent(slice.share)}
            </span>
          </li>
        ))}
      </ul>

      {flyout}
    </div>
  );
}
