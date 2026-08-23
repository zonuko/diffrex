/**
 * ノイズ（空白・インデント・コメントのみの差分）判定モジュール (P4-02)。
 */

import type { DiffHunkRaw } from "../diff.ts";

export interface NoiseAnalysisResult {
  isNoise: boolean;
  noiseReason?: "whitespace" | "comment" | "empty";
}

/**
 * 渡された文字列から、文字列リテラル（", ', `）の外部にあるコメント（//, /* *\/, #）および余分な空白を除去する。
 */
export function stripCommentsAndWhitespace(lines: string[]): string {
  const text = lines.join("\n");
  let result = "";
  let i = 0;
  const len = text.length;

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inBlockComment = false;

  while (i < len) {
    const char = text[i];
    const nextChar = i + 1 < len ? text[i + 1] : "";

    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (inSingleQuote) {
      result += char;
      if (char === "\\" && i + 1 < len) {
        result += nextChar;
        i += 2;
      } else {
        if (char === "'") inSingleQuote = false;
        i++;
      }
      continue;
    }

    if (inDoubleQuote) {
      result += char;
      if (char === "\\" && i + 1 < len) {
        result += nextChar;
        i += 2;
      } else {
        if (char === '"') inDoubleQuote = false;
        i++;
      }
      continue;
    }

    if (inBacktick) {
      result += char;
      if (char === "\\" && i + 1 < len) {
        result += nextChar;
        i += 2;
      } else {
        if (char === "`") inBacktick = false;
        i++;
      }
      continue;
    }

    // リテラル外のコメント開始判定
    if (char === "/" && nextChar === "/") {
      // 行末までスキップ
      while (i < len && text[i] !== "\n") {
        i++;
      }
      continue;
    }

    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (char === "#") {
      // Python / Shell 等の行コメント（リテラル外）
      while (i < len && text[i] !== "\n") {
        i++;
      }
      continue;
    }

    // 文字列の開始
    if (char === "'") {
      inSingleQuote = true;
      result += char;
      i++;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      result += char;
      i++;
      continue;
    }
    if (char === "`") {
      inBacktick = true;
      result += char;
      i++;
      continue;
    }

    // 空白文字は正規化用に1つのスペースにするか詰める
    if (/\s/.test(char)) {
      if (result.length > 0 && !/\s/.test(result[result.length - 1])) {
        result += " ";
      }
      i++;
      continue;
    }

    result += char;
    i++;
  }

  return result.trim();
}

/**
 * 空白正規化（line.trim().replace(/\s+/g, " ")）した結果が左右で完全に一致するか判定する。
 */
export function isWhitespaceOnlyChange(
  leftLines: string[],
  rightLines: string[],
): boolean {
  const normLeft = leftLines.map((l) => l.trim().replace(/\s+/g, " ")).filter(
    (l) => l.length > 0,
  );
  const normRight = rightLines.map((l) => l.trim().replace(/\s+/g, " ")).filter(
    (l) => l.length > 0,
  );

  if (normLeft.length !== normRight.length) {
    // 空行のみの増減チェック（どちらも非空行が0件の場合）
    if (normLeft.length === 0 && normRight.length === 0) {
      return true;
    }
    return false;
  }

  for (let i = 0; i < normLeft.length; i++) {
    if (normLeft[i] !== normRight[i]) {
      return false;
    }
  }

  return true;
}

/**
 * 差分 Hunk がノイズ（空白・インデント・コメントのみの増減）であるかを判定する。
 */
export function analyzeNoise(hunk: DiffHunkRaw): NoiseAnalysisResult {
  const { leftLines, rightLines } = hunk;

  // 1. 空白・インデントのみの変更
  if (isWhitespaceOnlyChange(leftLines, rightLines)) {
    return {
      isNoise: true,
      noiseReason: "whitespace",
    };
  }

  // 2. コメントを除去して残りの実質コードが完全一致するか確認
  const strippedLeft = stripCommentsAndWhitespace(leftLines);
  const strippedRight = stripCommentsAndWhitespace(rightLines);

  if (strippedLeft === strippedRight) {
    return {
      isNoise: true,
      noiseReason: "comment",
    };
  }

  return {
    isNoise: false,
  };
}
