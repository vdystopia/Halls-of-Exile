import { rarityClass, SOCKET_COLOR_CLASS } from "@/lib/items";
import type { ParsedItem } from "@/lib/types";

function Sockets({ groups }: { groups: ParsedItem["sockets"] }) {
  if (!groups.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="flex items-center">
          {group.map((color, socketIndex) => (
            <span key={socketIndex} className="flex items-center">
              {socketIndex > 0 ? <span className="h-px w-2 bg-line-strong" /> : null}
              <span
                className={`h-2.5 w-2.5 rounded-full border border-black/60 ${SOCKET_COLOR_CLASS[color] ?? "bg-muted"}`}
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ItemTooltipBody({ item }: { item: ParsedItem }) {
  const meta = [
    item.itemLevel ? `Item level ${item.itemLevel}` : null,
    item.quality ? `Quality +${item.quality}%` : null,
    item.levelReq ? `Requires level ${item.levelReq}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-2 text-xs leading-relaxed">
      <div className="border-b border-line pb-2">
        <p className={`font-display text-sm ${rarityClass(item.rarity)}`}>{item.name}</p>
        {item.base && item.base !== item.name ? (
          <p className={`${rarityClass(item.rarity)} opacity-80`}>{item.base}</p>
        ) : null}
      </div>
      {meta.length ? <p className="text-muted">{meta.join(" · ")}</p> : null}
      <Sockets groups={item.sockets} />
      {item.implicits.length ? (
        <ul className="space-y-0.5 border-b border-line pb-2 text-rarity-magic/90">
          {item.implicits.map((mod, index) => (
            <li key={index}>{mod}</li>
          ))}
        </ul>
      ) : null}
      {item.explicits.length ? (
        <ul className="space-y-0.5 text-[#8ba7e8]">
          {item.explicits.map((mod, index) => (
            <li key={index}>{mod}</li>
          ))}
        </ul>
      ) : null}
      {item.influences.length || item.flags.length ? (
        <p className="border-t border-line pt-2 text-[0.68rem] tracking-wider text-muted uppercase">
          {[...item.influences, ...item.flags].join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

export function ItemCard({
  item,
  label,
  className = "",
}: {
  item?: ParsedItem;
  label: string;
  className?: string;
}) {
  if (!item) {
    return (
      <div className={`rounded border border-dashed border-line/70 p-3 ${className}`}>
        <p className="eyebrow">{label}</p>
        <p className="mt-1 text-xs text-muted/50">empty</p>
      </div>
    );
  }

  const modCount = item.implicits.length + item.explicits.length;

  return (
    <div className={`hover-card ${className}`} tabIndex={0}>
      <div className="h-full rounded border border-line bg-surface-2/70 p-3 transition-colors hover:border-line-strong">
        <p className="eyebrow">{label}</p>
        <p className={`mt-1 font-display text-[0.82rem] leading-snug ${rarityClass(item.rarity)}`}>{item.name}</p>
        {item.base && item.base !== item.name ? (
          <p className="text-xs text-muted">{item.base}</p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <Sockets groups={item.sockets} />
          <span className="text-[0.68rem] text-muted/70">{modCount} mods</span>
        </div>
      </div>
      <div className="hover-card-panel absolute top-full left-1/2 z-50 mt-2 w-[min(22rem,80vw)] -translate-x-1/2 rounded border border-line-strong bg-abyss/98 p-3 shadow-2xl">
        <ItemTooltipBody item={item} />
      </div>
    </div>
  );
}
