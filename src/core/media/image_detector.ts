/**
 * 画像フォーマットの判定およびメタデータ（MIMEタイプ、解像度 width/height）抽出ユーティリティ。
 */

export interface ImageMetadata {
  isImage: boolean;
  mimeType: string;
  extension: string;
  width?: number;
  height?: number;
}

const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
};

/**
 * ファイルパスの拡張子から画像かどうかを判定する。
 */
export function isImageExtension(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  for (const ext of Object.keys(EXT_TO_MIME)) {
    if (lower.endsWith(ext)) {
      return true;
    }
  }
  return false;
}

/**
 * 拡張子から MIME タイプを取得する。
 */
export function getMimeTypeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  for (const [ext, mime] of Object.entries(EXT_TO_MIME)) {
    if (lower.endsWith(ext)) {
      return mime;
    }
  }
  return "application/octet-stream";
}

/**
 * バイナリデータ（Uint8Array）のマジックナンバーおよびヘッダーから画像メタデータを判定・抽出する。
 */
export function detectImageMetadata(
  bytes: Uint8Array,
  filePath: string,
): ImageMetadata {
  const ext = "." + (filePath.split(".").pop()?.toLowerCase() || "");
  let mimeType = EXT_TO_MIME[ext] || "application/octet-stream";
  let isImage = isImageExtension(filePath);
  let width: number | undefined;
  let height: number | undefined;

  // マジックナンバー判定
  if (
    bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    // PNG
    isImage = true;
    mimeType = "image/png";
    if (bytes.length >= 24) {
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      width = view.getUint32(16, false);
      height = view.getUint32(20, false);
    }
  } else if (
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    // JPEG
    isImage = true;
    mimeType = "image/jpeg";
    // JPEG SOF マーカー走査
    let offset = 2;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (offset < bytes.length - 8) {
      if (bytes[offset] === 0xff) {
        const marker = bytes[offset + 1];
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          height = view.getUint16(offset + 5, false);
          width = view.getUint16(offset + 7, false);
          break;
        }
        const length = view.getUint16(offset + 2, false);
        offset += 2 + length;
      } else {
        offset++;
      }
    }
  } else if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    // GIF
    isImage = true;
    mimeType = "image/gif";
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    width = view.getUint16(6, true);
    height = view.getUint16(8, true);
  } else if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    // BMP
    isImage = true;
    mimeType = "image/bmp";
    if (bytes.length >= 26) {
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      width = view.getInt32(18, true);
      height = Math.abs(view.getInt32(22, true));
    }
  } else if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    // WebP
    isImage = true;
    mimeType = "image/webp";
    if (bytes.length >= 30) {
      // VP8 / VP8L / VP8X
      const chunk = String.fromCharCode(
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15],
      );
      if (chunk === "VP8 " && bytes.length >= 30) {
        width = ((bytes[27] << 8) | bytes[26]) & 0x3fff;
        height = ((bytes[29] << 8) | bytes[28]) & 0x3fff;
      } else if (chunk === "VP8L" && bytes.length >= 25) {
        const b0 = bytes[21];
        const b1 = bytes[22];
        const b2 = bytes[23];
        const b3 = bytes[24];
        width = 1 + (((b1 & 0x3f) << 8) | b0);
        height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      } else if (chunk === "VP8X" && bytes.length >= 30) {
        width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      }
    }
  } else if (ext === ".svg" || isSvgContent(bytes)) {
    isImage = true;
    mimeType = "image/svg+xml";
    const dims = parseSvgDimensions(bytes);
    width = dims.width;
    height = dims.height;
  }

  return {
    isImage,
    mimeType,
    extension: ext,
    width,
    height,
  };
}

function isSvgContent(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(
    bytes.subarray(0, Math.min(bytes.length, 512)),
  );
  return head.includes("<svg") ||
    head.includes('xmlns="http://www.w3.org/2000/svg"');
}

function parseSvgDimensions(
  bytes: Uint8Array,
): { width?: number; height?: number } {
  try {
    const text = new TextDecoder().decode(
      bytes.subarray(0, Math.min(bytes.length, 2048)),
    );
    const widthMatch = text.match(/<svg[^>]*\bwidth=["']([0-9.]+)(px)?["']/i);
    const heightMatch = text.match(/<svg[^>]*\bheight=["']([0-9.]+)(px)?["']/i);
    let width = widthMatch ? parseFloat(widthMatch[1]) : undefined;
    let height = heightMatch ? parseFloat(heightMatch[1]) : undefined;

    if ((!width || !height) && text.includes("viewBox")) {
      const vbMatch = text.match(/<svg[^>]*\bviewBox=["']([0-9.\s,-]+)["']/i);
      if (vbMatch) {
        const parts = vbMatch[1].trim().split(/[\s,]+/).map(parseFloat);
        if (parts.length === 4) {
          if (!width) width = parts[2];
          if (!height) height = parts[3];
        }
      }
    }
    return { width, height };
  } catch {
    return {};
  }
}

/**
 * Uint8Array を Base64 Data URL 文字列に変換する。
 */
export function uint8ArrayToDataUrl(
  bytes: Uint8Array,
  mimeType: string,
): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary);
  return `data:${mimeType};base64,${b64}`;
}
