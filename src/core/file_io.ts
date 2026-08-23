/**
 * ファイルおよび stdin の読み込み・書き戻し関連処理（P1-04 〜 P1-07）。
 */

import { dirname } from "@std/path";
import type { DiffSessionData, FileTarget } from "./types.ts";

export type LineEnding = "lf" | "crlf";

export interface FileMetadata {
  lineEnding: LineEnding;
  hasTrailingNewline: boolean;
  hasBom: boolean;
}

/**
 * バイト列に NUL バイト (0x00) が含まれるか判定する。
 */
export function isBinary(bytes: Uint8Array): boolean {
  return bytes.includes(0x00);
}

/**
 * バイト列が UTF-8 BOM (0xEF, 0xBB, 0xBF) で始まるか判定する。
 */
export function hasUtf8Bom(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  );
}

/**
 * 改行コードの種別を検出する。
 * CRLF が1つでも含まれていれば "crlf"、それ以外は "lf"。
 */
export function detectLineEnding(text: string): LineEnding {
  return text.includes("\r\n") ? "crlf" : "lf";
}

/**
 * テキストが末尾改行（\n または \r\n）で終わっているか判定する。
 */
export function detectTrailingNewline(text: string): boolean {
  return text.endsWith("\n") || text.endsWith("\r\n");
}

/**
 * バイト列およびデコード後文字列からメタデータを検出する。
 */
export function extractMetadata(
  bytes: Uint8Array,
  text: string,
): FileMetadata {
  return {
    lineEnding: detectLineEnding(text),
    hasTrailingNewline: detectTrailingNewline(text),
    hasBom: hasUtf8Bom(bytes),
  };
}

/**
 * バイト列を UTF-8 テキストとしてデコードする。
 * BOM が存在する場合は除去して文字列化する。
 * 不正な UTF-8 バイト列の場合はエラーを投げる。
 */
export function decodeUtf8(bytes: Uint8Array): string {
  const slice = hasUtf8Bom(bytes) ? bytes.subarray(3) : bytes;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return decoder.decode(slice);
}

export interface ReadFileOptions {
  readOnly?: boolean;
}

export interface ReadFileResult {
  target: FileTarget;
  meta: FileMetadata;
}

/**
 * 画像ファイルを読み込み、`ImageTarget` を返す。
 */
export async function readImageTarget(
  path: string,
): Promise<import("./types.ts").ImageTarget> {
  const { detectImageMetadata, uint8ArrayToDataUrl } = await import(
    "./media/image_detector.ts"
  );
  const bytes = await Deno.readFile(path);
  const meta = detectImageMetadata(bytes, path);
  const dataUrl = uint8ArrayToDataUrl(bytes, meta.mimeType);

  return {
    path,
    dataUrl,
    mimeType: meta.mimeType,
    sizeBytes: bytes.byteLength,
    width: meta.width,
    height: meta.height,
  };
}

/**
 * 指定されたパスのファイルを読み込み、`FileTarget` と `FileMetadata` を返す。
 *
 * @throws {Error} バイナリファイルまたは UTF-8 としてデコードできない場合
 */
export async function readFileTarget(
  path: string,
  options?: ReadFileOptions,
): Promise<ReadFileResult> {
  const bytes = await Deno.readFile(path);

  if (isBinary(bytes)) {
    throw new Error(`cannot compare binary file: '${path}'`);
  }

  let text: string;
  try {
    text = decodeUtf8(bytes);
  } catch (err) {
    throw new Error(
      `failed to decode '${path}' as UTF-8: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const meta = extractMetadata(bytes, text);

  // ファイルのパーミッションや readOnly フラグから判定
  let isReadOnly = Boolean(options?.readOnly);
  try {
    const fileInfo = await Deno.stat(path);
    // mode が取得可能な環境（Unix 等）で書き込み権限がない場合
    if (fileInfo.mode !== null && (fileInfo.mode & 0o200) === 0) {
      isReadOnly = true;
    }
  } catch {
    // stat 失敗時は引数の options.readOnly を尊重
  }

  return {
    target: {
      path,
      content: text,
      readOnly: isReadOnly,
    },
    meta,
  };
}

/**
 * stdin からテキストを読み込み、`FileTarget` と `FileMetadata` を返す。
 * stdin は常に readOnly: true となる。
 *
 * @throws {Error} ターミナル直接接続時、またはバイナリ/UTF-8不正の場合
 */
export async function readStdinTarget(
  _options?: ReadFileOptions,
): Promise<ReadFileResult> {
  if (Deno.stdin.isTerminal()) {
    throw new Error(
      "cannot read from stdin: standard input is an interactive terminal",
    );
  }

  const chunks: Uint8Array[] = [];
  const reader = Deno.stdin.readable.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  if (isBinary(bytes)) {
    throw new Error("cannot compare binary content from stdin");
  }

  let text: string;
  try {
    text = decodeUtf8(bytes);
  } catch (err) {
    throw new Error(
      `failed to decode stdin as UTF-8: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const meta = extractMetadata(bytes, text);

  return {
    target: {
      path: "<stdin>",
      content: text,
      readOnly: true, // stdin 側は常に read-only
    },
    meta,
  };
}

/**
 * メタデータ（改行コード・BOM・末尾改行）を反映してバイト列へエンコードする。
 */
export function encodeWithMetadata(
  content: string,
  meta: FileMetadata,
): Uint8Array {
  let normalized = content.replace(/\r\n/g, "\n");

  // 末尾改行の調整
  if (meta.hasTrailingNewline) {
    if (!normalized.endsWith("\n")) {
      normalized += "\n";
    }
  } else {
    normalized = normalized.replace(/\n+$/, "");
  }

  // 改行コードの変換
  const converted = meta.lineEnding === "crlf"
    ? normalized.replace(/\n/g, "\r\n")
    : normalized;

  const encoder = new TextEncoder();
  const textBytes = encoder.encode(converted);

  if (meta.hasBom) {
    const bomBytes = new Uint8Array([0xef, 0xbb, 0xbf]);
    const result = new Uint8Array(bomBytes.length + textBytes.length);
    result.set(bomBytes, 0);
    result.set(textBytes, bomBytes.length);
    return result;
  }

  return textBytes;
}

/**
 * セッションデータから保存先パスを解決する（優先順: outputPath → files.right.path）。
 */
export function resolveSavePath(session: DiffSessionData): string {
  if (session.outputPath && session.outputPath.trim().length > 0) {
    return session.outputPath;
  }
  return session.files.right.path;
}

export interface WriteFileOptions {
  readOnly?: boolean;
}

/**
 * ファイルを原子的（同一ディレクトリ内一時ファイル + rename）に書き戻す。
 * 元ファイルの改行コード・BOM・末尾改行を保持する。
 *
 * @throws {Error} 読み取り専用指定時、一時ファイル作成失敗時、または rename 失敗時
 */
export async function writeFileTarget(
  path: string,
  content: string,
  meta?: FileMetadata,
  options?: WriteFileOptions,
): Promise<void> {
  if (options?.readOnly || path === "<stdin>") {
    throw new Error(`cannot write to read-only target: '${path}'`);
  }

  const defaultMeta: FileMetadata = {
    lineEnding: "lf",
    hasTrailingNewline: true,
    hasBom: false,
  };

  const effectiveMeta = meta ?? defaultMeta;
  const encoded = encodeWithMetadata(content, effectiveMeta);

  // 原子的書き込みのために同一ディレクトリ内に一時ファイルを作成
  const targetDir = dirname(path);
  const tempFileName = `.Diffrex_tmp_${crypto.randomUUID()}`;
  const tempPath = targetDir === "." || targetDir === ""
    ? tempFileName
    : `${targetDir}/${tempFileName}`;

  try {
    await Deno.writeFile(tempPath, encoded);
    await Deno.rename(tempPath, path);
  } catch (err) {
    // 失敗時は一時ファイルのクリーンアップを試みる
    try {
      await Deno.remove(tempPath);
    } catch {
      // ignore cleanup error
    }
    throw new Error(
      `failed to write file '${path}': ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
