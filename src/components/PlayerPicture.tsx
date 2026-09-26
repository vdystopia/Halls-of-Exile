/**
 * A player's picture, or their initial where they have none: one square for
 * the player tile and the profile header both, so the two draw the same thing
 * at their own sizes. The caller sets the size through `className`.
 */
export function PlayerPicture({
  username,
  src,
  className,
}: {
  username: string;
  src: string | null;
  className: string;
}) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-sm bg-surface-3 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a player's own upload, already a small square
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span className="display flex size-full items-center justify-center text-[2.5em] text-gold/60">
          {username.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}
