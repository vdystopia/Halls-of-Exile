"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { ClassFill } from "@/lib/games/class-colors";
import { pointAt, type PieSlice } from "@/lib/pie";

/** One class on the wheel, resolved on the server: its share, its colours and its ascendancies. */
export type PieClass = {
  name: string;
  characters: number;
  /** The class's colour stops for the legend swatch. */
  swatch: string[];
  /** How the slice is painted: a gem's solid, or a hybrid's run between its neighbours. */
  fill: ClassFill;
  ascendancies: { name: string; characters: number; known: boolean }[];
};

/** The hub at the centre: the class at the tree's centre, or nothing, and its radius in the wheel's units. */
export type PieHub = { item: PieClass | null; share: number; radius: number };

/** The chart's own coordinates; it scales to its box. The slices were laid out in these by ClassBreakdown. */
const SIZE = 240;
const CENTRE = SIZE / 2;
/** About what one character of the 10px label costs, in the chart's units. */
const GLYPH = 5.6;
/** The flyout's width, which its left edge is clamped against. */
const FLYOUT_WIDTH = 224;
const GOLD = "#c8aa6e";
const INK = "#0a0908";

const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * A player's characters by class, as a wheel beside the class table: the whole
 * at a glance where the table has the figures.
 *
 * It is a map of the tree drawn as stained glass. The six ring classes go round
 * in the tree's order with Witch at the top; a solid class is its gem's colour,
 * lit mid-depth and dark at the rim, and a hybrid runs along its arc from the
 * class before it into the class after, so the ring is one continuous wheel
 * of the three attributes. Scion sits in the hub at the centre, painted in the
 * same wheel at the same angles so its blue faces Witch and its green Ranger,
 * with a gold border between hub and ring. Over all of it lie a gem's gloss and
 * a grain of stone, drawn with SVG gradients and filters, and a slim gold rim
 * closes it. A class's name is set along its slice's radius, reading outward
 * from the hub, so it fits however thin the slice; Scion's alone is level.
 *
 * Resting on a slice, the hub or a legend row, or tabbing to one, opens a
 * flyout with the class's ascendancies and how many characters took each. The
 * flyout is portalled to the body and fixed beside the pointer, above it when
 * the pointer is in the lower half of the window; Escape closes it, and it is
 * the focused slice's description for a screen reader.
 */
export function ClassPie({ slices, hub, total, game }: { slices: PieSlice<PieClass>[]; hub: PieHub; total: number; game: string }) {
  // The hub is index -1; the ring's slices are 0…n-1.
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
  const current = active === null ? null : active === -1 ? hub.item : slices[active].item;
  const currentShare = active === null ? 0 : active === -1 ? hub.share : slices[active].value / (total || 1);

  useEffect(() => {
    if (active === null || via !== "pointer") return;
    const off = () => hide();
    window.addEventListener("scroll", off, { passive: true });
    return () => window.removeEventListener("scroll", off);
  }, [active, via]);

  const radius = slices[0] ? Math.hypot(slices[0].anchor.x - CENTRE, slices[0].anchor.y - CENTRE) - 6 : 112;
  const hubR = hub.radius;
  const entries: { item: PieClass; index: number; value: number }[] = [
    ...slices.map((slice, index) => ({ item: slice.item, index, value: slice.value })),
    ...(hub.item ? [{ item: hub.item, index: -1, value: hub.item.characters }] : []),
  ];
  const summary = entries.map((entry) => `${entry.item.name} ${entry.value} (${percent(entry.value / (total || 1))})`).join(", ");

  const handlers = (index: number) => ({
    onMouseEnter: (event: React.MouseEvent) => show(index, { x: event.clientX, y: event.clientY }),
    onMouseMove: (event: React.MouseEvent) => setPointer({ x: event.clientX, y: event.clientY }),
    onMouseLeave: hide,
    onFocus: (event: React.FocusEvent<SVGElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      show(index, { x: box.left + box.width / 2, y: box.top + box.height / 2 }, "focus");
    },
    onBlur: hide,
  });

  /**
   * A slice's fill, at a given radius: the hub repeats the ring's wedges at its
   * own size so the colours line up. A run goes along the arc from the class
   * before to the class after; a solid is lit mid-depth and dark at the ends.
   */
  const fillDefs = (slice: PieSlice<PieClass>, key: string, r: number) => {
    const fill = slice.item.fill;
    if (fill.kind === "run") {
      const from = pointAt(CENTRE, CENTRE, r * 0.7, slice.start);
      const to = pointAt(CENTRE, CENTRE, r * 0.7, slice.end);
      return (
        <linearGradient key={key} id={key} gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={to.x} y2={to.y}>
          {fill.stops.map((stop, at) => (
            <stop key={at} offset={`${(at / (fill.stops.length - 1)) * 100}%`} stopColor={stop} />
          ))}
        </linearGradient>
      );
    }
    const gem = fill.kind === "solid" ? fill : { light: "#a99f8c", base: "#8b8272", dark: "#4a4338" };
    return (
      <radialGradient key={key} id={key} gradientUnits="userSpaceOnUse" cx={CENTRE} cy={CENTRE} r={r}>
        <stop offset="0%" stopColor={gem.dark} />
        <stop offset="20%" stopColor={gem.base} />
        <stop offset="55%" stopColor={gem.light} />
        <stop offset="82%" stopColor={gem.base} />
        <stop offset="100%" stopColor={gem.dark} />
      </radialGradient>
    );
  };

  /** The hub's wedge at a ring slice's angles, so the hub's colours face the ring's. */
  const hubWedge = (slice: PieSlice<PieClass>) => {
    const from = pointAt(CENTRE, CENTRE, hubR, slice.start);
    const to = pointAt(CENTRE, CENTRE, hubR, slice.end);
    const large = slice.end - slice.start > 180 ? 1 : 0;
    return `M ${CENTRE} ${CENTRE} L ${from.x} ${from.y} A ${hubR} ${hubR} 0 ${large} 1 ${to.x} ${to.y} Z`;
  };

  /**
   * A name along its slice's radius, reading outward from the hub. On the left
   * half of the wheel that would read upside down, so there it is turned round
   * and reads inward, still upright, still along the radius.
   */
  const radialLabel = (slice: PieSlice<PieClass>) => {
    const bearing = ((slice.middle % 360) + 360) % 360;
    const right = bearing <= 180;
    const at = pointAt(CENTRE, CENTRE, hubR + 7, slice.middle);
    const rotate = right ? bearing - 90 : bearing + 90;
    const length = slice.item.name.length * GLYPH;
    if (hubR + 7 + length > radius - 4) return null;
    return { x: at.x, y: at.y, rotate, anchor: (right ? "start" : "end") as "start" | "end" };
  };

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
              <span className="font-display tracking-wide text-gold-bright">{current.name}</span>
              <span className="text-muted tabular-nums">
                {current.characters} · {percent(currentShare)}
              </span>
            </p>
            <ul className="mt-2 space-y-0.5 border-t border-line pt-2">
              {current.ascendancies.map((ascendancy) => (
                <li key={ascendancy.name} className="flex items-baseline justify-between gap-3">
                  <span className={ascendancy.known ? "text-parchment/85" : "text-muted"}>{ascendancy.name}</span>
                  <span className="text-muted tabular-nums">
                    {ascendancy.characters} · {percent(ascendancy.characters / current.characters)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-muted">{game}</p>
          </div>,
          document.body,
        )
      : null;

  const dim = (index: number) => active !== null && active !== index;

  return (
    <div className="flex flex-col items-center gap-4 pt-1">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Characters by class: ${summary}`}
        className="w-full max-w-[340px]"
        onMouseLeave={hide}
        onKeyDown={(event) => {
          if (event.key === "Escape") hide();
        }}
      >
        <defs>
          {slices.map((slice, index) => fillDefs(slice, `${ids}-ring-${index}`, radius))}
          {hub.item ? slices.map((slice, index) => fillDefs(slice, `${ids}-hub-${index}`, hubR)) : null}
          {/* The gloss: light from the upper left, the far rim in shadow. */}
          <radialGradient id={`${ids}-gloss`} cx="0.36" cy="0.3" r="0.8">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.36" />
            <stop offset="30%" stopColor="#fff" stopOpacity="0.1" />
            <stop offset="60%" stopColor="#000" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
          </radialGradient>
          {/* The grain: fractal noise, greyed, laid over the wheel as soft light. */}
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

        {/* The ring. */}
        {slices.map((slice, index) => (
          <path
            key={slice.item.name}
            d={slice.path}
            fillRule="evenodd"
            fill={`url(#${ids}-ring-${index})`}
            opacity={dim(index) ? 0.55 : 1}
            tabIndex={0}
            aria-label={`${slice.item.name}: ${slice.value} of ${total} characters, ${percent(slice.value / (total || 1))}`}
            aria-describedby={active === index ? flyoutId : undefined}
            className="cursor-default outline-none transition-opacity"
            {...handlers(index)}
          />
        ))}

        {/* The hub: Scion's wheel at the ring's angles, or a dark boss when there is no Scion. */}
        {hub.item ? (
          <g
            tabIndex={0}
            aria-label={`${hub.item.name}: ${hub.item.characters} of ${total} characters, ${percent(hub.share)}`}
            aria-describedby={active === -1 ? flyoutId : undefined}
            opacity={dim(-1) ? 0.55 : 1}
            className="cursor-default outline-none transition-opacity"
            {...handlers(-1)}
          >
            {slices.length > 1 ? (
              slices.map((slice, index) => <path key={slice.item.name} d={hubWedge(slice)} fill={`url(#${ids}-hub-${index})`} />)
            ) : (
              <circle cx={CENTRE} cy={CENTRE} r={hubR} fill={`url(#${ids}-hub-0)`} />
            )}
          </g>
        ) : (
          <circle cx={CENTRE} cy={CENTRE} r={hubR} fill={INK} />
        )}

        {/* Over the glass, in order: the grain, the gloss, then the leading between panes. */}
        <g className="pointer-events-none" clipPath={`url(#${ids}-disc)`}>
          <rect x="0" y="0" width={SIZE} height={SIZE} filter={`url(#${ids}-grain)`} opacity="0.34" style={{ mixBlendMode: "soft-light" }} />
          <circle cx={CENTRE} cy={CENTRE} r={radius} fill={`url(#${ids}-gloss)`} />
          {slices.length > 1
            ? slices.map((slice) => {
                const inner = pointAt(CENTRE, CENTRE, hubR, slice.start);
                const outer = pointAt(CENTRE, CENTRE, radius, slice.start);
                return (
                  <g key={`lead-${slice.item.name}`}>
                    <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
                    <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={GOLD} strokeWidth={0.9} strokeOpacity={0.8} strokeLinecap="round" />
                  </g>
                );
              })
            : null}
          {/* The border between hub and ring. */}
          <circle cx={CENTRE} cy={CENTRE} r={hubR} fill="none" stroke={INK} strokeWidth={3} />
          <circle cx={CENTRE} cy={CENTRE} r={hubR} fill="none" stroke={GOLD} strokeWidth={1.2} />
        </g>
        {/* A slim rim: dark under gold, with a fainter line just inside it. */}
        <circle cx={CENTRE} cy={CENTRE} r={radius + 1.5} fill="none" stroke={INK} strokeWidth={4} className="pointer-events-none" />
        <circle cx={CENTRE} cy={CENTRE} r={radius + 1.5} fill="none" stroke={GOLD} strokeWidth={1.8} className="pointer-events-none" />
        <circle cx={CENTRE} cy={CENTRE} r={radius - 3} fill="none" stroke={GOLD} strokeWidth={0.5} strokeOpacity={0.5} className="pointer-events-none" />

        {/* Names along their radii, reading outward; Scion's level in the hub. */}
        {slices.map((slice) => {
          const place = radialLabel(slice);
          if (!place) return null;
          return (
            <text
              key={`label-${slice.item.name}`}
              x={place.x}
              y={place.y}
              transform={`rotate(${place.rotate} ${place.x} ${place.y})`}
              textAnchor={place.anchor}
              dominantBaseline="middle"
              className="pointer-events-none fill-white text-[10px] font-medium"
              style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 2.5 }}
            >
              {slice.item.name}
            </text>
          );
        })}
        {hub.item && hubR >= hub.item.name.length * GLYPH * 0.55 ? (
          <text
            x={CENTRE}
            y={CENTRE}
            textAnchor="middle"
            dominantBaseline="middle"
            className="pointer-events-none fill-white text-[10px] font-medium"
            style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 2.5 }}
          >
            {hub.item.name}
          </text>
        ) : null}
      </svg>

      <ul className="grid w-full max-w-[340px] grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {entries.map((entry) => (
          <li
            key={entry.item.name}
            className={`flex items-center gap-2 transition-opacity ${dim(entry.index) ? "opacity-50" : ""}`}
            onMouseEnter={(event) => show(entry.index, { x: event.clientX, y: event.clientY })}
            onMouseMove={(event) => setPointer({ x: event.clientX, y: event.clientY })}
            onMouseLeave={hide}
          >
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/60"
              style={{
                background:
                  entry.item.swatch.length > 1 ? `linear-gradient(135deg, ${entry.item.swatch.join(", ")})` : entry.item.swatch[0],
              }}
            />
            <span className="truncate text-parchment/85">{entry.item.name}</span>
            <span className="ml-auto shrink-0 text-muted tabular-nums whitespace-nowrap">
              {entry.value} · {percent(entry.value / (total || 1))}
            </span>
          </li>
        ))}
      </ul>

      {flyout}
    </div>
  );
}
