import { db } from "./db";

/**
 * A player's picture. The browser crops and shrinks it to a small square WebP
 * before it is sent (`AvatarInput`), so what arrives is normally a few tens of
 * kilobytes; the limit here is for a browser that could not, and the type is
 * read from the file's own first bytes rather than trusted from the upload.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const SIGNATURES: { type: string; test: (bytes: Buffer) => boolean }[] = [
  { type: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", test: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  {
    type: "image/webp",
    test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

/** The image type these bytes are, or null when they are none that is accepted. */
export function imageType(bytes: Buffer): string | null {
  return SIGNATURES.find((signature) => signature.test(bytes))?.type ?? null;
}

/**
 * The picture a form sent, checked: null when the field was left empty, an
 * error message when it is not an image this accepts.
 */
export async function readAvatarUpload(value: FormDataEntryValue | null): Promise<{ image: Buffer; type: string } | string | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  if (value.size > AVATAR_MAX_BYTES) return "The picture is over 2 MB. Pick a smaller one.";
  const image = Buffer.from(await value.arrayBuffer());
  const type = imageType(image);
  if (!type) return "The picture has to be a PNG, JPEG, WebP or GIF.";
  return { image, type };
}

/**
 * The picture's strongest colour, for the profile header to take its border
 * and figures from — the purple of a glowing hand rather than the black around
 * it. The picture is read at 48x48 and every pixel is binned by hue, weighted
 * by how saturated it is and how far from black or white, so a small vivid
 * region outweighs a large dull one; the winning bin's pixels are averaged.
 * The result is then lifted to at least the lightness and saturation the
 * archive's gold has, so it reads as text on the dark panel. A picture with no
 * colour in it — greyscale, or near enough — gives null, and the header keeps
 * its gold.
 */
export async function avatarAccent(image: Buffer): Promise<string | null> {
  const SIDE = 48;
  let pixels: Buffer;
  try {
    const { default: sharp } = await import("sharp");
    pixels = await sharp(image).resize(SIDE, SIDE, { fit: "cover" }).removeAlpha().raw().toBuffer();
  } catch {
    return null;
  }

  const BINS = 24;
  const bins = Array.from({ length: BINS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  for (let offset = 0; offset + 2 < pixels.length; offset += 3) {
    const r = pixels[offset] / 255;
    const g = pixels[offset + 1] / 255;
    const b = pixels[offset + 2] / 255;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 0.2 || l < 0.08 || l > 0.95) continue;
    // Strongest in the middle of the lightness range, fading to nothing at either end.
    const weight = s * (1 - Math.abs(l - 0.5) * 2);
    const bin = bins[Math.floor(h * BINS) % BINS];
    bin.weight += weight;
    bin.r += r * weight;
    bin.g += g * weight;
    bin.b += b * weight;
  }
  const best = bins.reduce((top, bin) => (bin.weight > top.weight ? bin : top), bins[0]);
  // Fewer than a handful of fully saturated pixels' worth: not a colour, a stray.
  if (best.weight < 4) return null;

  const [h, s, l] = rgbToHsl(best.r / best.weight, best.g / best.weight, best.b / best.weight);
  const [r, g, b] = hslToRgb(h, Math.max(s, 0.45), Math.max(l, 0.66));
  return `#${[r, g, b].map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Hue in [0, 1), saturation and lightness in [0, 1]. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

/**
 * The accent is worked out before the save and written with the picture, so
 * the save itself stays a plain statement that fits inside a transaction.
 */
export function saveAvatar(userId: number, avatar: { image: Buffer; type: string }, accent: string | null) {
  db.prepare(
    `INSERT INTO avatars (user_id, image, type, updated_at, accent) VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT (user_id) DO UPDATE SET image = excluded.image, type = excluded.type,
       updated_at = excluded.updated_at, accent = excluded.accent`,
  ).run(userId, avatar.image, avatar.type, accent);
}

/**
 * A player's accent colour, or null when they have no picture or it has no
 * colour. A picture saved before the column existed has none stored, so it is
 * read the first time it is asked for and kept.
 */
export async function playerAccent(userId: number): Promise<string | null> {
  const row = db.prepare(`SELECT image, accent FROM avatars WHERE user_id = ?`).get(userId) as
    | { image: Buffer; accent: string | null }
    | undefined;
  if (!row) return null;
  if (row.accent !== null) return row.accent;
  const accent = await avatarAccent(row.image);
  // An empty string marks "read, and there was no colour", so it is not re-read every visit.
  db.prepare(`UPDATE avatars SET accent = ? WHERE user_id = ?`).run(accent ?? "", userId);
  return accent;
}

export function removeAvatar(userId: number) {
  db.prepare(`DELETE FROM avatars WHERE user_id = ?`).run(userId);
}

export function getAvatar(username: string): { image: Buffer; type: string; updatedAt: string } | null {
  const row = db
    .prepare(
      `SELECT a.image, a.type, a.updated_at FROM avatars a JOIN users u ON u.id = a.user_id
       WHERE u.username = ? COLLATE NOCASE`,
    )
    .get(username) as { image: Buffer; type: string; updated_at: string } | undefined;
  return row ? { image: row.image, type: row.type, updatedAt: row.updated_at } : null;
}

/**
 * Where a player's picture is served, with its last change in the query so a
 * browser can keep it for a year and still sees a new one at once.
 */
export function avatarUrl(username: string, version: string | null): string | null {
  return version ? `/api/avatars/${encodeURIComponent(username)}?v=${encodeURIComponent(version)}` : null;
}
