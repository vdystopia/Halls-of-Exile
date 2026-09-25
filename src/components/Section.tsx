import type { ReactNode } from "react";

/**
 * A titled section of a page that opens and closes. Plain `<details>`, so it
 * needs no client code, and closed unless `open` says otherwise: a player page
 * is a long list of rollups, and the titles alone are the table of contents.
 *
 * The group is named because sections hold their own `<details>` (the class
 * table's rows), and an unnamed `group-open:` would answer to either.
 */
export function Section({
  title,
  aside,
  open = false,
  children,
}: {
  title: ReactNode;
  /** Small print beside the toggle, such as a count. Not a link: a click there also toggles the section. */
  aside?: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group/section">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-3 group-open/section:mb-4 [&::-webkit-details-marker]:hidden">
        <h2 className="display text-xl">{title}</h2>
        <span className="flex items-center gap-4 text-xs">
          {aside}
          <span className="tag group-hover/section:border-gold/60 group-hover/section:text-gold">
            <span className="group-open/section:hidden">Expand ▾</span>
            <span className="hidden group-open/section:inline">Collapse ▴</span>
          </span>
        </span>
      </summary>
      {children}
    </details>
  );
}
