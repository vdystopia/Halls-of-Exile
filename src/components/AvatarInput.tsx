"use client";

import { useEffect, useRef, useState } from "react";

/** Twice the largest size a tile draws it at, for a high-DPI screen. */
const SIZE = 320;

/**
 * A picture field that crops the chosen image to its centre square and shrinks
 * it to 320px WebP in the browser before the form sends it, so a 6 MB phone
 * photo arrives as a few tens of kilobytes. If the browser cannot do that the
 * original is sent as it is and the server's own limit applies.
 */
export function AvatarInput({
  name = "avatar",
  id = "avatar",
  current,
}: {
  name?: string;
  id?: string;
  /** The picture the player has now, shown until another is picked. */
  current?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  async function shrink(file: File) {
    try {
      const bitmap = await createImageBitmap(file);
      const side = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.min(SIZE, side);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");
      context.imageSmoothingQuality = "high";
      context.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
      if (!blob) throw new Error("no blob");
      const small = new File([blob], "avatar.webp", { type: blob.type || "image/webp" });
      const transfer = new DataTransfer();
      transfer.items.add(small);
      if (input.current) input.current.files = transfer.files;
      setPreview(URL.createObjectURL(small));
      setNote(null);
    } catch {
      setPreview(URL.createObjectURL(file));
      setNote("This picture could not be resized here, so it is sent as it is (2 MB at most).");
    }
  }

  const shown = preview ?? current ?? null;
  return (
    <div className="flex items-center gap-4">
      <div className="size-20 shrink-0 overflow-hidden rounded border border-line bg-surface">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview or the player's own upload
          <img src={shown} alt="" className="size-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0">
        <input
          ref={input}
          id={id}
          name={name}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded file:border file:border-line-strong file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-parchment hover:file:border-gold"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void shrink(file);
            else setPreview(null);
          }}
        />
        <p className="mt-1 text-xs text-muted">
          {note ?? "Cropped to a square from its centre. PNG, JPEG, WebP or GIF."}
        </p>
      </div>
    </div>
  );
}
