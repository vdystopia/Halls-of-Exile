/**
 * A picture's strongest colour, for a border or a figure to take — the purple
 * of a glowing hand rather than the black around it. The profile header reads
 * a player's picture this way at save time; the ascendancy art indexes are
 * read this way once, by the art script, so a character banner can take its
 * class picture's colour without decoding anything at request time. The picture is read at 48x48 and every pixel is binned by hue, weighted
 * by how saturated it is and how far from black or white, so a small vivid
 * region outweighs a large dull one; the winning bin's pixels are averaged.
 * The result is then lifted to at least the lightness and saturation the
 * archive's gold has, so it reads as text on the dark panel. A picture with no
 * colour in it — greyscale, or near enough — gives null, and the header keeps
 * its gold.
 */
export async function imageAccent(image: Buffer): Promise<string | null> {
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
