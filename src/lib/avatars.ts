import { imageAccent } from "./accent";
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

/** The picture's strongest colour, lifted to read as text: see `src/lib/accent.ts`. */
export const avatarAccent = imageAccent;

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
