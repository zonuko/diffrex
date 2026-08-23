/**
 * YAML 構造化データの正規化（Canonicalization: キーの辞書順ソート）ユーティリティ。
 */
import { parse, stringify } from "@std/yaml";
import { canonicalizeValue } from "./json_canonicalizer.ts";

/**
 * YAML 文字列をパースし、キー順序を正規化した上で整形 YAML 文字列を返す。
 * パース失敗時は元の文字列をそのまま返す。
 */
export function canonicalizeYaml(yamlStr: string): {
  success: boolean;
  content: string;
  error?: string;
} {
  try {
    const parsed = parse(yamlStr);
    const canonical = canonicalizeValue(parsed);
    const result = stringify(canonical as Record<string, unknown>, {
      indent: 2,
    });
    return {
      success: true,
      content: result,
    };
  } catch (err) {
    return {
      success: false,
      content: yamlStr,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 2つの YAML 文字列が意味論的に完全一致するか（キー順序やインデントの違いのみか）を判定する。
 */
export function isSemanticallyEqualYaml(
  leftYaml: string,
  rightYaml: string,
): boolean {
  try {
    const leftParsed = parse(leftYaml);
    const rightParsed = parse(rightYaml);
    const leftCanonical = JSON.stringify(canonicalizeValue(leftParsed));
    const rightCanonical = JSON.stringify(canonicalizeValue(rightParsed));
    return leftCanonical === rightCanonical;
  } catch {
    return false;
  }
}
