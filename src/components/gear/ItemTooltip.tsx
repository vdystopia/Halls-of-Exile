import type { ParsedItem } from "@/lib/types";
import { SOCKET_COLOR_CLASS } from "@/lib/items";

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

/**
 * Mods are stored as strings, and a tagged one carries its tags after a "·"
 * separator (the format the parser has always written). Splitting here keeps
 * older characters rendering with the right colours without a data migration.
 */
function splitMod(line: string): { text: string; tags: string[] } {
  const [text, tags] = line.split("  ·  ");
  return { text, tags: tags ? tags.split(", ").map((tag) => tag.trim()) : [] };
}

function modColour(tags: string[]): string {
  if (tags.includes("crafted")) return "var(--color-mod-crafted)";
  if (tags.includes("fractured")) return "var(--color-mod-fractured)";
  return "var(--color-mod)";
}

function Divider({ colour }: { colour: string }) {
  return <div className="my-1.5 h-px w-full opacity-30" style={{ background: colour }} />;
}

function Property({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[color:var(--color-tip-label)]">
      {label}: <span className="text-white">{value}</span>
    </p>
  );
}

function Sockets({ groups }: { groups: ParsedItem["sockets"] }) {
  if (!groups.length) return null;
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

/** An item tooltip in the shape Path of Building and the game itself use. */
export function ItemTooltip({ item }: { item: ParsedItem }) {
  const colour = rarityColour(item.rarity);
  const hasProperties = Boolean(item.quality || item.armour || item.evasion || item.energyShield);
  const corrupted = item.flags.includes("Corrupted");
  const otherFlags = item.flags.filter((flag) => flag !== "Corrupted");

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
        {hasProperties ? (
          <>
            <Divider colour={colour} />
            {item.quality ? <Property label="Quality" value={`+${item.quality}%`} /> : null}
            {item.armour ? <Property label="Armour" value={String(item.armour)} /> : null}
            {item.evasion ? <Property label="Evasion Rating" value={String(item.evasion)} /> : null}
            {item.energyShield ? (
              <Property label="Energy Shield" value={String(item.energyShield)} />
            ) : null}
          </>
        ) : null}

        {item.levelReq ? (
          <>
            <Divider colour={colour} />
            <p className="text-[color:var(--color-tip-label)]">
              Requires Level <span className="text-white">{item.levelReq}</span>
            </p>
          </>
        ) : null}

        {item.sockets.length ? (
          <>
            <Divider colour={colour} />
            <Sockets groups={item.sockets} />
          </>
        ) : null}

        {item.itemLevel ? (
          <>
            <Divider colour={colour} />
            <Property label="Item Level" value={String(item.itemLevel)} />
          </>
        ) : null}

        {item.implicits.length ? (
          <>
            <Divider colour={colour} />
            {item.implicits.map((line, index) => {
              const mod = splitMod(line);
              return (
                <p key={index} style={{ color: modColour(mod.tags) }}>
                  {mod.text}
                </p>
              );
            })}
          </>
        ) : null}

        {item.explicits.length ? (
          <>
            <Divider colour={colour} />
            {item.explicits.map((line, index) => {
              const mod = splitMod(line);
              return (
                <p key={index} style={{ color: modColour(mod.tags) }}>
                  {mod.text}
                </p>
              );
            })}
          </>
        ) : null}

        {item.influences.length || otherFlags.length || corrupted ? (
          <>
            <Divider colour={colour} />
            {[...item.influences.map((name) => `${name} Item`), ...otherFlags].map((flag) => (
              <p key={flag} className="text-[color:var(--color-tip-label)]">
                {flag}
              </p>
            ))}
            {corrupted ? <p style={{ color: "var(--color-corrupt)" }}>Corrupted</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
