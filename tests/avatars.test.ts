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
