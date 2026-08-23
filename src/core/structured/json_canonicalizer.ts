/**
 * JSON 構造化データの正規化（Canonicalization: キーの辞書順ソート）ユーティリティ。
 */

/**
 * 任意の JavaScript オブジェクト/値を再帰的にトラバースし、
 * オブジェクトのキーをアルファベット昇順でソートした新しいオブジェクトを生成する。
 */
export function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    result[key] = canonicalizeValue(obj[key]);
  }

  return result;
}

/**
 * JSON 文字列をパースし、キー順序を正規化した上で整形 JSON 文字列（2スペースインデント）を返す。
 * パース失敗時は元の文字列をそのまま返す。
 */
export function canonicalizeJson(jsonStr: string, indent = 2): {
  success: boolean;
  content: string;
  error?: string;
} {
  try {
    const parsed = JSON.parse(jsonStr);
    const canonical = canonicalizeValue(parsed);
    return {
      success: true,
      content: JSON.stringify(canonical, null, indent),
    };
  } catch (err) {
    return {
      success: false,
      content: jsonStr,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 2つの JSON 文字列が意味論的に完全一致するか（キー順序や空白の違いのみか）を判定する。
 */
export function isSemanticallyEqualJson(
  leftJson: string,
  rightJson: string,
): boolean {
  try {
    const leftParsed = JSON.parse(leftJson);
    const rightParsed = JSON.parse(rightJson);
    const leftCanonical = JSON.stringify(canonicalizeValue(leftParsed));
    const rightCanonical = JSON.stringify(canonicalizeValue(rightParsed));
    return leftCanonical === rightCanonical;
  } catch {
    return false;
  }
}
