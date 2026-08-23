/**
 * Tree-sitter WASM パーサーの初期化と言語ローダーモジュール (B2-01)。
 */

import Parser from "web-tree-sitter";
import { fromFileUrl, join } from "@std/path";

let isInitialized = false;
const loadedLanguages = new Map<string, Parser.Language>();

/** サポート対象言語 ID */
export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "rust"
  | "go"
  | "ruby";

/** ファイル拡張子からサポート言語を判定 */
export function detectLanguageFromFilename(
  filename: string,
): SupportedLanguage | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (
    lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  ) return "javascript";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".go")) return "go";
  if (
    lower.endsWith(".rb") || lower.endsWith(".rake") ||
    lower.endsWith("gemfile") || lower.endsWith("rakefile")
  ) return "ruby";
  return null;
}

/**
 * 指定言語の WASM バイナリを読み込む（複数パス候補を探索）。
 */
async function getWasmBytes(
  lang: SupportedLanguage,
): Promise<Uint8Array | null> {
  const filename = `tree-sitter-${lang}.wasm`;
  const candidatePaths: string[] = [];

  // 1. カレントディレクトリの vendor/tree-sitter/
  candidatePaths.push(join(Deno.cwd(), "vendor", "tree-sitter", filename));

  // 2. import.meta.url からの相対パス (src/core/analysis/ast -> ../../../../vendor/tree-sitter/)
  try {
    const currentDir = fromFileUrl(new URL(".", import.meta.url));
    candidatePaths.push(
      join(
        currentDir,
        "..",
        "..",
        "..",
        "..",
        "vendor",
        "tree-sitter",
        filename,
      ),
    );
    candidatePaths.push(join(currentDir, "vendor", "tree-sitter", filename));
  } catch {
    // ignore
  }

  for (const candidate of candidatePaths) {
    try {
      const bytes = await Deno.readFile(candidate);
      return bytes;
    } catch {
      // try next
    }
  }

  return null;
}

/**
 * Tree-sitter WASM ランタイムを初期化する。
 */
export async function initTreeSitter(): Promise<boolean> {
  if (isInitialized) return true;
  try {
    await Parser.init();
    isInitialized = true;
    return true;
  } catch (err) {
    console.warn("[AST] Parser.init failed:", err);
    return false;
  }
}

/**
 * 指定言語の Language オブジェクトをロードする（キャッシュあり）。
 */
export async function loadLanguage(
  lang: SupportedLanguage,
): Promise<Parser.Language | null> {
  const ready = await initTreeSitter();
  if (!ready) return null;

  if (loadedLanguages.has(lang)) {
    return loadedLanguages.get(lang)!;
  }

  try {
    const bytes = await getWasmBytes(lang);
    if (!bytes) {
      console.warn(`[AST] WASM file for ${lang} not found in candidate paths`);
      return null;
    }
    const language = await Parser.Language.load(bytes);
    loadedLanguages.set(lang, language);
    return language;
  } catch (err) {
    console.warn(`[AST] Failed to load language ${lang}:`, err);
    return null;
  }
}

/**
 * コードを AST にパースする。言語が未サポートまたは失敗時は null を返す。
 */
export async function parseCodeToAst(
  code: string,
  langOrFilename: SupportedLanguage | string,
): Promise<
  { tree: Parser.Tree; parser: Parser; language: SupportedLanguage } | null
> {
  const lang = (["typescript", "javascript", "python", "rust", "go", "ruby"]
      .includes(
        langOrFilename,
      )
    ? langOrFilename
    : detectLanguageFromFilename(langOrFilename)) as SupportedLanguage | null;

  if (!lang) return null;

  const language = await loadLanguage(lang);
  if (!language) return null;

  try {
    const parser = new Parser();
    parser.setLanguage(language);
    const tree = parser.parse(code);
    return { tree, parser, language: lang };
  } catch (err) {
    console.warn(`[AST] Failed to parse code for ${lang}:`, err);
    return null;
  }
}
