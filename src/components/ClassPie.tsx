"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { ClassFill } from "@/lib/games/class-colors";
import { pointAt, type PieSlice } from "@/lib/pie";

/** One class on the pie, resolved on the server: its share, its colours and its ascendancies. */
export type PieClass = {
  name: string;
  /** False for the "Unknown class" bucket, drawn in stone rather than a class colour. */
  known: boolean;
  characters: number;
  /** The class's colour stops for the legend swatch. */
  swatch: string[];
  /** How the slice is painted: a gem's solid, a hybrid's run between its neighbours, or stone. */
  fill: ClassFill;
  ascendancies: { name: string; characters: number; known: boolean }[];
};

/** The carved ring the pie sits in: each game's keystone frame, with its window as a fraction of its width. */
export type PieFrame = { src: string; window: number };

/** The chart's own coordinates; it scales to its box. The slices were laid out in these by ClassBreakdown. */
const SIZE = 240;
const CENTRE = SIZE / 2;
/** About what one character of the 10px label costs, in the chart's units, plus a margin either side. */
const GLYPH = 5.6;
const LABEL_MARGIN = 6;
/** Two labels closer than this, centre to centre, would overprint. */
const LABEL_CLEARANCE = { x: 46, y: 14 };
/** The flyout's width, which its left edge is clamped against. */
const FLYOUT_WIDTH = 224;
/** How far past the ring's window the wheel reaches, so its rim is under the carving rather than beside it. */
const UNDER_RING = 1.12;

const STONE = { light: "#a99f8c", base: "#8b8272", dark: "#4a4338" };

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
 * A player's characters by class, as a wheel beside the class table: the whole
 * at a glance where the table has the figures.
 *
 * It is drawn as a stained-glass window in the game's own keystone ring. The
 * slices go round in the passive tree's order with Witch at the top, so the
 * wheel is a rough map of the tree. A solid class is its gem's colour, lit in
 * the middle and dark at the rim; a hybrid runs from the colour of the class
 * before it into the class after, along its arc, so the whole disc is one
 * continuous wheel of the three attributes. Over all of it: a gem's gloss —
 * light falling from the upper left, the rim in shadow — and a grain of stone,
 * both drawn with SVG filters and gradients rather than pictures. Slices are
 * parted by a gold hairline, those with room carry their name, and the legend
 * beneath names them all with counts, so which slice is which never rests on
 * colour alone.
 *
 * Resting on a slice or a legend row, or tabbing to a slice, opens a flyout
 * with the class's ascendancies and how many characters took each. The flyout
 * is portalled to the body and fixed beside the pointer, above it when the
 * pointer is in the lower half of the window; Escape closes it, and it is the
 * focused slice's description for a screen reader.
 */
export function ClassPie({
  slices,
  total,
  game,
  frame,
}: {
  slices: PieSlice<PieClass>[];
  total: number;
  game: string;
  frame: PieFrame;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  // What opened it: a scroll closes a pointer-opened flyout (a tap on touch has
  // no other way out), but focusing a slice scrolls it into view first, and a
  // keyboard-opened flyout must survive that.
  const [via, setVia] = useState<"pointer" | "focus">("pointer");
  const ids = useId();
  const flyoutId = `${ids}-flyout`;

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

  useEffect(() => {
    if (active === null || via !== "pointer") return;
    const off = () => hide();
    window.addEventListener("scroll", off, { passive: true });
    return () => window.removeEventListener("scroll", off);
  }, [active, via]);

  const named = labelled(slices);
  const summary = slices.map((slice) => `${slice.item.name} ${slice.value} (${percent(slice.share)})`).join(", ");
  // The wheel's radius in the chart's units, as laid out by ClassBreakdown.
  const radius = slices[0] ? Math.hypot(slices[0].anchor.x - CENTRE, slices[0].anchor.y - CENTRE) - 6 : 100;
  // The wheel's width as a share of the ring's: the window, plus what tucks under the carving.
  const wheelShare = Math.min(0.9, frame.window * UNDER_RING);

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
    <div className="flex flex-col items-center gap-4 pt-1">
      {/* The ring, with the wheel centred in its window. The ring is painted over
          the wheel and lets the pointer through, so the slices under its inner
          edge still answer to hover. */}
      <div className="relative w-full max-w-[380px]" style={{ aspectRatio: "1 / 1" }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`Characters by class: ${summary}`}
          className="absolute"
          style={{
            width: `${wheelShare * 100}%`,
            height: `${wheelShare * 100}%`,
            left: `${((1 - wheelShare) / 2) * 100}%`,
            top: `${((1 - wheelShare) / 2) * 100}%`,
          }}
          onMouseLeave={hide}
          onKeyDown={(event) => {
            if (event.key === "Escape") hide();
          }}
        >
          <defs>
            {slices.map((slice, index) => {
              const fill = slice.item.fill;
              if (fill.kind === "run") {
                // Along the arc, from where the slice begins to where it ends,
                // so the colour of the class before flows into the class after.
                const from = pointAt(CENTRE, CENTRE, radius * 0.7, slice.start);
                const to = pointAt(CENTRE, CENTRE, radius * 0.7, slice.end);
                return (
                  <linearGradient key={index} id={`${ids}-fill-${index}`} gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={to.x} y2={to.y}>
                    {fill.stops.map((stop, at) => (
                      <stop key={at} offset={`${(at / (fill.stops.length - 1)) * 100}%`} stopColor={stop} />
                    ))}
                  </linearGradient>
                );
              }
              const gem = fill.kind === "solid" ? fill : STONE;
              // Lit in the middle of the wedge's depth, darker at the hub and the rim: a cut stone.
              return (
                <radialGradient key={index} id={`${ids}-fill-${index}`} gradientUnits="userSpaceOnUse" cx={CENTRE} cy={CENTRE} r={radius}>
                  <stop offset="0%" stopColor={gem.dark} />
                  <stop offset="18%" stopColor={gem.base} />
                  <stop offset="52%" stopColor={gem.light} />
                  <stop offset="80%" stopColor={gem.base} />
                  <stop offset="100%" stopColor={gem.dark} />
                </radialGradient>
              );
            })}
            {/* The gloss: light from the upper left, the far rim in shadow. */}
            <radialGradient id={`${ids}-gloss`} cx="0.36" cy="0.3" r="0.8">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.38" />
              <stop offset="30%" stopColor="#fff" stopOpacity="0.12" />
              <stop offset="60%" stopColor="#000" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.5" />
            </radialGradient>
            {/* The grain: fractal noise, greyed, laid over the wheel at low strength. */}
            <filter id={`${ids}-grain`} x="0" y="0" width="1" height="1">
              <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="4" seed="7" stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.9" />
              </feComponentTransfer>
            </filter>
            <clipPath id={`${ids}-disc`}>
              <circle cx={CENTRE} cy={CENTRE} r={radius} />
            </clipPath>
          </defs>

          {slices.map((slice, index) => {
            const dimmed = active !== null && active !== index;
            return (
              <path
                key={slice.item.name}
                d={slice.path}
                fill={`url(#${ids}-fill-${index})`}
                opacity={dimmed ? 0.55 : 1}
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
                className="cursor-default outline-none transition-opacity"
              />
            );
          })}

          {/* Over the slices, in order: the grain, the gloss, then the leading between panes. */}
          <g className="pointer-events-none" clipPath={`url(#${ids}-disc)`}>
            <rect x="0" y="0" width={SIZE} height={SIZE} filter={`url(#${ids}-grain)`} opacity="0.34" style={{ mixBlendMode: "soft-light" }} />
            <circle cx={CENTRE} cy={CENTRE} r={radius} fill={`url(#${ids}-gloss)`} />
            {slices.length > 1
              ? slices.map((slice) => {
                  const edge = pointAt(CENTRE, CENTRE, radius, slice.start);
                  return (
                    <line
                      key={`lead-${slice.item.name}`}
                      x1={CENTRE}
                      y1={CENTRE}
                      x2={edge.x}
                      y2={edge.y}
                      stroke="#0a0908"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                    />
                  );
                })
              : null}
            {slices.length > 1
              ? slices.map((slice) => {
                  const edge = pointAt(CENTRE, CENTRE, radius, slice.start);
                  return (
                    <line
                      key={`gold-${slice.item.name}`}
                      x1={CENTRE}
                      y1={CENTRE}
                      x2={edge.x}
                      y2={edge.y}
                      stroke="#c8aa6e"
                      strokeWidth={0.9}
                      strokeOpacity={0.75}
                      strokeLinecap="round"
                    />
                  );
                })
              : null}
            {/* The hub, where the tree's Scion would sit. */}
            <circle cx={CENTRE} cy={CENTRE} r={5} fill="#0a0908" stroke="#c8aa6e" strokeWidth={1.2} />
          </g>

          {slices.map((slice, index) =>
            named.has(index) ? (
              <text
                key={`label-${slice.item.name}`}
                x={slice.label.x}
                y={slice.label.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none fill-white text-[10px] font-medium"
                style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 2.5 }}
              >
                {slice.item.name}
              </text>
            ) : null,
          )}
        </svg>
        {/* The carved ring, over the wheel. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: `url(${frame.src})`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
        />
      </div>

      <ul className="grid w-full max-w-[340px] grid-cols-2 gap-x-4 gap-y-1 text-xs">
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
              className="inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/60"
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
