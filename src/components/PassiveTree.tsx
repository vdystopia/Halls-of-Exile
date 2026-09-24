"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClusterLayout } from "@/lib/games/poe1/clusters";

/**
 * A character's passive tree, drawn.
 *
 * The tree itself is a static SVG generated per version by `npm run tree:svg` —
 * the *empty* tree, identical for everyone who played that version, so the
 * browser fetches one cacheable file rather than a render per character. It is
 * loaded through an `<object>` on purpose: three thousand circles have no
 * business in React's reconciler or in this page's HTML, and a separate
 * document keeps them out of both.
 *
 * Allocation is a stylesheet rather than a mutation. Every circle and line in
 * the SVG takes its colour from `currentColor`, so lighting a character's tree
 * is one `#n1234 { color: … }` rule per allocated node, handed over as a single
 * constructed stylesheet. Switching characters costs the number of allocated
 * nodes, not a walk of the whole tree, and nothing in the SVG is ever touched.
 *
 * A connection is lit only when both of its ends are, which is what makes the
 * allocation read as a path rather than as scattered dots. The SVG names each
 * connection `c<a>-<b>`, so that needs no graph data on this side.
 *
 * Cluster jewels are the one thing added to the document. The empty tree cannot
 * hold them — a cluster exists only once a jewel is socketed — so the server
 * lays out this character's clusters (`lib/games/poe1/clusters.ts`) and passes
 * finished circles and lines, which are appended under the same ids and classes
 * the tree uses. The stylesheet then lights them exactly as it lights the rest.
 */
export function PassiveTree({
  src,
  nodes,
  clusters,
  ascendancy,
  allocatedCount,
  treeVersion,
  className = "",
}: {
  /** The generated tree for this build's version, under /trees. */
  src: string;
  /** Allocated node ids, clusters included. Ids with nothing drawn are counted, not lit. */
  nodes: number[];
  /** This character's clusters, already placed. */
  clusters?: ClusterLayout | null;
  /** Which ascendancy cluster to reveal; every one is stacked in the same corner. */
  ascendancy?: string | null;
  allocatedCount: number;
  treeVersion?: string | null;
  className?: string;
}) {
  const host = useRef<HTMLObjectElement>(null);
  const [ready, setReady] = useState(false);
  const [drawn, setDrawn] = useState<number | null>(null);
  const [hover, setHover] = useState<{ name: string; kind: string; stats: string[]; x: number; y: number } | null>(
    null,
  );

  /**
   * Paint the allocation into the loaded document.
   *
   * `adoptedStyleSheets` rather than an injected `<style>`: the rules are built
   * once as a sheet and swapped wholesale, so re-running this replaces the
   * previous allocation instead of stacking another few hundred rules on top of
   * it every time.
   */
  const paint = useCallback(() => {
    const doc = host.current?.contentDocument;
    if (!doc?.documentElement) return;

    // Clusters go in first, so the allocation below finds their nodes.
    drawClusters(doc, clusters);

    const allocated = new Set(nodes);
    const rules: string[] = [];
    // Only the ascendancy this character actually took. The generator stacks
    // all thirty-seven in one place, so without this they overlap into a blot.
    if (ascendancy) rules.push(`.asc-${cssEscape(ascendancy)}{display:inline}`);

    let found = 0;
    for (const id of allocated) {
      if (!doc.getElementById(`n${id}`)) continue;
      found += 1;
      rules.push(`#n${id}{color:var(--tree-on)}`);
    }
    // Both ends, or the line is not part of the path the character walked.
    for (const line of doc.querySelectorAll<SVGElement>("g.connections > *")) {
      const [a, b] = line.id.slice(1).split("-").map(Number);
      if (allocated.has(a) && allocated.has(b)) rules.push(`#${cssEscape(line.id)}{color:var(--tree-on)}`);
    }

    // The sheet has to be constructed in the SVG document's own realm: Chrome
    // refuses to adopt one built by the parent window, which is what the first
    // version of this did and it took the whole page down with it.
    const view = doc.defaultView as (Window & typeof globalThis) | null;
    const css = rules.join("");
    if (view && "CSSStyleSheet" in view) {
      const sheet = new view.CSSStyleSheet();
      sheet.replaceSync(css);
      doc.adoptedStyleSheets = [sheet];
    } else {
      // Nothing in the supported range lands here, but a <style> the paint
      // owns and replaces is a correct fallback rather than a broken tree.
      const existing = doc.getElementById("allocated");
      const style = existing ?? doc.createElementNS("http://www.w3.org/2000/svg", "style");
      style.id = "allocated";
      style.textContent = css;
      if (!existing) doc.documentElement.append(style);
    }
    setDrawn(found);
  }, [nodes, clusters, ascendancy]);

  // The tooltip text is baked into the SVG as data attributes, so hovering
  // costs nothing beyond reading them off the element under the pointer.
  useEffect(() => {
    if (!ready) return;
    const doc = host.current?.contentDocument;
    if (!doc) return;

    const over = (event: Event) => {
      const target = event.target as SVGElement | null;
      if (!target?.id?.startsWith("n")) return setHover(null);
      const name = target.getAttribute("data-name");
      if (!name) return setHover(null);
      const box = target.getBoundingClientRect();
      const frame = host.current?.getBoundingClientRect();
      setHover({
        name,
        kind: target.getAttribute("data-kind") ?? "",
        stats: (target.getAttribute("data-stats") ?? "").split(" ;; ").filter(Boolean),
        // The rect is in the inner document's coordinates, which share an
        // origin with the object element once its own offset is added.
        x: box.left + box.width / 2 + (frame?.left ?? 0),
        y: box.top + (frame?.top ?? 0),
      });
    };
    const out = () => setHover(null);

    doc.addEventListener("mouseover", over);
    doc.addEventListener("mouseleave", out);
    return () => {
      doc.removeEventListener("mouseover", over);
      doc.removeEventListener("mouseleave", out);
    };
  }, [ready]);

  // Zoom and pan by rewriting the viewBox. A CSS transform would be cheaper to
  // composite, but the viewBox keeps hit-testing and the tooltip's coordinates
  // in tree units, which is what makes the hover maths above hold at any zoom.
  useEffect(() => {
    if (!ready) return;
    const doc = host.current?.contentDocument;
    const root = doc?.documentElement as unknown as SVGSVGElement | undefined;
    if (!doc || !root) return;

    const initial = (root.getAttribute("viewBox") ?? "0 0 1000 1000").split(/\s+/).map(Number);
    let [x, y, w, h] = initial;
    const apply = () => root.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);

    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(event.deltaY / 600);
      // Floor and ceiling in terms of the whole tree, so a zoom cannot lose it.
      const next = Math.min(Math.max(w * factor, initial[2] / 8), initial[2] * 1.2);
      const scale = next / w;
      // Zoom about the pointer rather than the centre, so the thing being
      // looked at stays under the cursor.
      const rect = root.getBoundingClientRect();
      const px = x + ((event.clientX - rect.left) / rect.width) * w;
      const py = y + ((event.clientY - rect.top) / rect.height) * h;
      x = px - (px - x) * scale;
      y = py - (py - y) * scale;
      w = next;
      h *= scale;
      apply();
    };

    let dragging: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      dragging = { x: event.clientX, y: event.clientY };
      root.setPointerCapture?.(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      const rect = root.getBoundingClientRect();
      x -= ((event.clientX - dragging.x) / rect.width) * w;
      y -= ((event.clientY - dragging.y) / rect.height) * h;
      dragging = { x: event.clientX, y: event.clientY };
      apply();
    };
    const up = () => {
      dragging = null;
    };

    doc.addEventListener("wheel", wheel, { passive: false });
    doc.addEventListener("pointerdown", down);
    doc.addEventListener("pointermove", move);
    doc.addEventListener("pointerup", up);
    doc.addEventListener("pointercancel", up);
    return () => {
      doc.removeEventListener("wheel", wheel);
      doc.removeEventListener("pointerdown", down);
      doc.removeEventListener("pointermove", move);
      doc.removeEventListener("pointerup", up);
      doc.removeEventListener("pointercancel", up);
    };
  }, [ready]);

  useEffect(() => {
    if (ready) paint();
  }, [ready, paint]);

  // An <object> that is already loaded when React attaches fires no load event,
  // which left the tree grey on a warm cache.
  const attach = useCallback((node: HTMLObjectElement | null) => {
    host.current = node;
    if (node?.contentDocument?.getElementById("n1") || node?.contentDocument?.querySelector("g.nodes")) {
      setReady(true);
    }
  }, []);

  const missing = drawn !== null && allocatedCount - drawn;

  return (
    <div className={`relative ${className}`}>
      <object
        ref={attach}
        data={src}
        type="image/svg+xml"
        aria-label="Passive tree"
        onLoad={() => setReady(true)}
        className="block h-full w-full touch-none rounded-sm bg-black/40"
      />

      {hover ? (
        <div
          className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-full rounded-sm border border-line bg-black/90 px-3 py-2 shadow-lg shadow-black/60"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          <p className="font-display text-sm text-gold">{hover.name}</p>
          {hover.stats.map((stat) => (
            <p key={stat} className="mt-0.5 text-xs text-parchment/85">
              {stat}
            </p>
          ))}
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-2 bottom-2 flex flex-col items-end gap-0.5 text-right">
        <span className="text-[11px] text-muted">
          {allocatedCount} passives{treeVersion ? ` · tree ${treeVersion}` : ""}
        </span>
        {/* Clusters are drawn, so a gap here is a passive this tree cannot
            place — a jewel whose text could not be read, or a build drawn on a
            tree version that lacks one of its notables. Said rather than hidden,
            so a count that does not add up is never a mystery. */}
        {missing ? (
          <span className="text-[11px] text-muted/70" title="Passives the build records that this tree has no place for">
            {missing} not on this tree
          </span>
        ) : null}
      </div>
    </div>
  );
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Append a character's clusters to the loaded tree, under the ids and classes
 * the tree's own nodes use, so its stylesheet and the allocation rules apply to
 * them unchanged. Idempotent: a repaint removes the previous layer first.
 *
 * Lines go directly after the tree's own connections and circles after its
 * nodes, so a cluster's links pass under every node rather than over them.
 */
function drawClusters(doc: Document, clusters: ClusterLayout | null | undefined) {
  doc.getElementById("cluster-links")?.remove();
  doc.getElementById("cluster-nodes")?.remove();
  if (!clusters?.nodes.length) return;

  const links = doc.createElementNS(SVG_NS, "g");
  links.id = "cluster-links";
  links.setAttribute("class", "connections cluster");
  for (const edge of clusters.edges) {
    const element = doc.createElementNS(SVG_NS, edge.d ? "path" : "line");
    element.id = edge.id;
    if (edge.d) element.setAttribute("d", edge.d);
    else {
      element.setAttribute("x1", String(edge.x1));
      element.setAttribute("y1", String(edge.y1));
      element.setAttribute("x2", String(edge.x2));
      element.setAttribute("y2", String(edge.y2));
    }
    links.append(element);
  }

  const nodes = doc.createElementNS(SVG_NS, "g");
  nodes.id = "cluster-nodes";
  nodes.setAttribute("class", "nodes cluster");
  for (const node of clusters.nodes) {
    const circle = doc.createElementNS(SVG_NS, "circle");
    circle.id = `n${node.id}`;
    circle.setAttribute("cx", String(node.x));
    circle.setAttribute("cy", String(node.y));
    circle.setAttribute("r", String(node.r));
    circle.setAttribute("data-kind", node.kind);
    circle.setAttribute("data-name", node.name);
    // The separator the tooltip already splits the tree's own stats on.
    if (node.stats.length) circle.setAttribute("data-stats", node.stats.join(" ;; "));
    nodes.append(circle);
  }

  const treeLinks = doc.querySelector("g.connections:not(.cluster)");
  const treeNodes = doc.querySelector("g.nodes:not(.cluster)");
  if (treeLinks) treeLinks.after(links);
  else doc.documentElement.append(links);
  if (treeNodes) treeNodes.after(nodes);
  else doc.documentElement.append(nodes);
}

/** Ids and class names go into selectors, and a name can carry punctuation. */
function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/[^\w-]/g, "\\$&");
}
