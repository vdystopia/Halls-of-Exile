/**
 * Placeholder art. Real item icons replace these later; until then each slot
 * gets a simple silhouette so the paper doll is readable without labels.
 */
export type SlotShape =
  | "weapon"
  | "offhand"
  | "helmet"
  | "body"
  | "gloves"
  | "boots"
  | "belt"
  | "amulet"
  | "ring"
  | "flask"
  | "jewel";

const PATHS: Record<SlotShape, string> = {
  weapon: "M32 6 38 14 38 40 32 46 26 40 26 14Z M29 46h6l-1 12h-4Z",
  offhand: "M32 6c8 4 14 5 18 5v18c0 12-8 20-18 25-10-5-18-13-18-25V11c4 0 10-1 18-5Z",
  helmet: "M14 28c0-11 8-19 18-19s18 8 18 19v10c0 8-6 14-10 14H24c-4 0-10-6-10-14Z M22 30h20v6H22Z",
  body: "M20 10h24l6 10-4 6 4 28H18l4-28-4-6Z M28 10c0 4 2 6 4 6s4-2 4-6",
  gloves: "M18 20h10V8h6v12h4V10h6v10h4v22c0 6-4 10-10 10H28c-6 0-10-4-10-10Z",
  boots: "M22 8h12v24l14 10v10H22c-4 0-6-2-6-6V14c0-4 2-6 6-6Z",
  belt: "M8 26h48v12H8Z M26 22h12v20H26Z M30 28h4v8h-4Z",
  amulet: "M20 10c0 10 5 14 12 14s12-4 12-14 M32 24c6 0 10 5 10 11s-4 11-10 11-10-5-10-11 4-11 10-11Z",
  ring: "M32 16c9 0 16 7 16 16s-7 16-16 16-16-7-16-16 7-16 16-16Zm0 8c-4.5 0-8 3.5-8 8s3.5 8 8 8 8-3.5 8-8-3.5-8-8-8Z M26 12h12l-3 6h-6Z",
  flask: "M26 8h12v10l8 16v18c0 4-3 6-7 6H25c-4 0-7-2-7-6V34l8-16Z M20 36h24v14H20Z",
  jewel: "M32 8 50 24 32 56 14 24Z",
};

export function SlotIcon({ shape, className = "" }: { shape: SlotShape; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className} fill="currentColor">
      <path d={PATHS[shape]} fillRule="evenodd" />
    </svg>
  );
}
