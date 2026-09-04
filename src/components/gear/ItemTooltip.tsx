import { SOCKET_COLOR_CLASS } from "@/lib/items";
import { buildTooltip, type SectionKind, type TooltipLine } from "@/lib/tooltip";
import type { ParsedItem } from "@/lib/types";

const RARITY_COLOUR: Record<string, string> = {
  NORMAL: "#c8c8c8",
  MAGIC: "#8888ff",
  RARE: "#ffff77",
  UNIQUE: "#af6025",
  RELIC: "#af6025",
};

function rarityColour(rarity: string): string {
  return RARITY_COLOUR[rarity.toUpperCase()] ?? RARITY_COLOUR.NORMAL;
}

function modColour(line: TooltipLine, kind: SectionKind): string {
  if (line.tags.includes("crafted")) return "var(--color-mod-crafted)";
  if (line.tags.includes("fractured")) return "var(--color-mod-fractured)";
  if (kind === "anoint" || kind === "enchant") return "var(--color-mod-crafted)";
  return "var(--color-mod)";
}

function Divider({ colour }: { colour: string }) {
  return <div className="my-1.5 h-px w-full opacity-30" style={{ background: colour }} />;
}

/** "Quality: +20%" and the defence lines: grey label, white value. */
function Property({ text }: { text: string }) {
  const split = text.indexOf(":");
  if (split === -1) return <p className="text-[color:var(--color-tip-label)]">{text}</p>;
  return (
    <p className="text-[color:var(--color-tip-label)]">
      {text.slice(0, split + 1)} <span className="text-white">{text.slice(split + 1).trim()}</span>
    </p>
  );
}

function Sockets({ groups }: { groups: ParsedItem["sockets"] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[color:var(--color-tip-label)]">Sockets:</span>
      <span className="flex items-center gap-1.5">
        {groups.map((group, groupIndex) => (
          <span key={groupIndex} className="flex items-center">
            {group.map((colour, socketIndex) => (
              <span key={socketIndex} className="flex items-center">
                {socketIndex > 0 ? <span className="h-px w-1.5 bg-white/50" /> : null}
                <span
                  className={`h-3 w-3 rounded-full border border-black/70 ${SOCKET_COLOR_CLASS[colour] ?? "bg-muted"}`}
                />
              </span>
            ))}
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * Every item renders through the same ordered sections, so a wand and a shield
 * read the same way. See src/lib/tooltip.ts for the order and for what is
 * deliberately never shown.
 */
export function ItemTooltip({ item }: { item: ParsedItem }) {
  const colour = rarityColour(item.rarity);
  const sections = buildTooltip(item);

  return (
    <div
      className="w-[21rem] max-w-[85vw] border font-sans text-[0.78rem] leading-[1.45] shadow-[0_18px_45px_-12px_rgba(0,0,0,0.95)]"
      style={{ borderColor: colour, background: "var(--color-tip-bg)" }}
    >
      <header
        className="px-3 py-2 text-center"
        style={{ background: `linear-gradient(180deg, ${colour}26, ${colour}0d)` }}
      >
        <p className="font-display text-[0.95rem] leading-tight" style={{ color: colour }}>
          {item.name}
        </p>
        {item.base && item.base !== item.name ? (
          <p className="font-display text-[0.9rem] leading-tight" style={{ color: colour }}>
            {item.base}
          </p>
        ) : null}
      </header>

      <div className="px-3 pb-2">
        {sections.map((section) => (
          <div key={section.kind}>
            <Divider colour={colour} />
            {section.kind === "sockets" ? (
              <Sockets groups={item.sockets} />
            ) : section.kind === "quality" || section.kind === "defences" ? (
              section.lines.map((line, index) => <Property key={index} text={line.text} />)
            ) : section.kind === "footer" ? (
              section.lines.map((line, index) => (
                <p
                  key={index}
                  style={{
                    color:
                      line.text === "Corrupted"
                        ? "var(--color-corrupt)"
                        : "var(--color-tip-label)",
                  }}
                >
                  {line.text}
                </p>
              ))
            ) : (
              section.lines.map((line, index) => (
                <p key={index} style={{ color: modColour(line, section.kind) }}>
                  {line.text}
                </p>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
