import assert from "node:assert/strict";
import test from "node:test";
import { imageType } from "../src/lib/avatars";

/**
 * A picture's type is read from its own first bytes, never from the upload's
 * claimed type, and it is served under that type: an SVG or an HTML page sent
 * as "image/png" would otherwise run as a document on the archive's origin.
 */
test("a picture is recognised by its bytes, and nothing but the four image types is", () => {
  assert.equal(imageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(imageType(Buffer.from("GIF89a....", "latin1")), "image/gif");
  assert.equal(imageType(Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 ", "latin1")), "image/webp");
  assert.equal(imageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')), null);
  assert.equal(imageType(Buffer.from("<!doctype html><html>")), null);
  assert.equal(imageType(Buffer.alloc(0)), null);
});

/**
 * The profile header takes its colour from the picture: the strongest colour
 * in it, lifted so it reads as text on the dark panel. A picture that is
 * mostly black with one vivid region gives that region's hue, not the black;
 * a greyscale picture gives nothing, and the header keeps its gold.
 */
test("a picture's accent is its strongest colour, lifted to read on the panel, or nothing", async () => {
  const { default: sharp } = await import("sharp");
  const { avatarAccent } = await import("../src/lib/avatars");
  const hue = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60) % 360;
  };

  // Black, with a purple square covering a sixth of it.
  const purple = await sharp({ create: { width: 60, height: 60, channels: 3, background: "#000000" } })
    .composite([
      {
        input: await sharp({ create: { width: 24, height: 24, channels: 3, background: "#8a2be2" } }).png().toBuffer(),
        left: 30,
        top: 30,
      },
    ])
    .png()
    .toBuffer();
  const accent = await avatarAccent(purple);
  assert.ok(accent && /^#[0-9a-f]{6}$/.test(accent), `not a colour: ${accent}`);
  assert.ok(Math.abs(hue(accent) - 271) < 15, `expected a purple, got ${accent}`);
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(accent.slice(at, at + 2), 16));
  assert.ok((Math.max(r, g, b) + Math.min(r, g, b)) / 2 >= 0.6 * 255, `too dark to read as text: ${accent}`);

  const grey = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#777777" } }).png().toBuffer();
  assert.equal(await avatarAccent(grey), null);
  assert.equal(await avatarAccent(Buffer.from("not an image")), null);
});
