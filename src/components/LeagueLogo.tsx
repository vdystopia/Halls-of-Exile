import { leagueLogo } from "@/lib/league-logos";
import type { League } from "@/lib/types";

/**
 * The league's logo, at the right of the character page header.
 *
 * Height is the caller's and the width follows the logo's own shape, the rule
 * `AscendancyPortrait` follows. The header passes the portrait's height, so the
 * two pictures bracket the header top and bottom. The fetch trims each logo's
 * transparent margin, so the drawn art really reaches both edges.
 *
 * A background rather than an `<img>`, like the portrait: a missing file leaves
 * nothing rather than a broken-image glyph. A league with no logo, a user-added
 * one, renders nothing and the header closes up.
 */
export function LeagueLogo({
  league,
  height,
  className = "",
}: {
  league: Pick<League, "game" | "slug" | "name">;
  /** In CSS pixels. */
  height: number;
  className?: string;
}) {
  const logo = leagueLogo(league);
  if (!logo) return null;
  return (
    <span
      role="img"
      aria-label={logo.generic ? league.name : `${league.name} logo`}
      title={league.name}
      className={`block shrink-0 ${className}`}
      style={{
        height,
        width: Math.round((height * logo.width) / logo.height),
        backgroundImage: `url(${logo.src})`,
        backgroundSize: "contain",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
