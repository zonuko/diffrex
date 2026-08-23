/**
 * 画像比較およびフォーマット判定のユニットテスト（B-5）。
 */
import { assertEquals } from "@std/assert";
import {
  detectImageMetadata,
  getMimeTypeFromPath,
  isImageExtension,
  uint8ArrayToDataUrl,
} from "../src/core/media/image_detector.ts";

Deno.test("isImageExtension - validates supported image formats", () => {
  assertEquals(isImageExtension("test.png"), true);
  assertEquals(isImageExtension("TEST.JPG"), true);
  assertEquals(isImageExtension("photo.jpeg"), true);
  assertEquals(isImageExtension("graphic.svg"), true);
  assertEquals(isImageExtension("anim.webp"), true);
  assertEquals(isImageExtension("icon.ico"), true);
  assertEquals(isImageExtension("code.ts"), false);
  assertEquals(isImageExtension("data.json"), false);
});

Deno.test("getMimeTypeFromPath - returns proper MIME types", () => {
  assertEquals(getMimeTypeFromPath("logo.png"), "image/png");
  assertEquals(getMimeTypeFromPath("photo.jpg"), "image/jpeg");
  assertEquals(getMimeTypeFromPath("vector.svg"), "image/svg+xml");
  assertEquals(getMimeTypeFromPath("anim.gif"), "image/gif");
});

Deno.test("detectImageMetadata - PNG magic numbers and dimensions", () => {
  // 1x1 PNG dummy bytes
  const pngHeader = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // PNG signature
    0x00,
    0x00,
    0x00,
    0x0d, // IHDR chunk length
    0x49,
    0x48,
    0x44,
    0x52, // IHDR
    0x00,
    0x00,
    0x03,
    0x20, // width: 800 (0x320)
    0x00,
    0x00,
    0x02,
    0x58, // height: 600 (0x258)
    0x08,
    0x06,
    0x00,
    0x00,
    0x00,
  ]);

  const meta = detectImageMetadata(pngHeader, "sample.png");
  assertEquals(meta.isImage, true);
  assertEquals(meta.mimeType, "image/png");
  assertEquals(meta.width, 800);
  assertEquals(meta.height, 600);
});

Deno.test("detectImageMetadata - GIF magic numbers and dimensions", () => {
  const gifHeader = new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61, // GIF89a
    0x64,
    0x00, // width: 100 (little endian)
    0xc8,
    0x00, // height: 200 (little endian)
  ]);

  const meta = detectImageMetadata(gifHeader, "sample.gif");
  assertEquals(meta.isImage, true);
  assertEquals(meta.mimeType, "image/gif");
  assertEquals(meta.width, 100);
  assertEquals(meta.height, 200);
});

Deno.test("detectImageMetadata - SVG dimensions extraction", () => {
  const svgText =
    '<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  const bytes = new TextEncoder().encode(svgText);

  const meta = detectImageMetadata(bytes, "diagram.svg");
  assertEquals(meta.isImage, true);
  assertEquals(meta.mimeType, "image/svg+xml");
  assertEquals(meta.width, 400);
  assertEquals(meta.height, 300);
});

Deno.test("uint8ArrayToDataUrl - converts binary to base64 data url", () => {
  const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  const url = uint8ArrayToDataUrl(bytes, "text/plain");
  assertEquals(url, "data:text/plain;base64,SGVsbG8=");
});
