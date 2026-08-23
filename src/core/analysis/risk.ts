/**
 * リスク評価およびサマリータグ生成モジュール (P4-03, P4-04)。
 */

import type { RiskLevel } from "../types.ts";
import type { DiffHunkRaw } from "../diff.ts";
import type { NoiseAnalysisResult } from "./noise.ts";

export interface RiskAnalysisResult {
  riskLevel: RiskLevel;
  summaryTag: string;
  reasons: string[];
}

// シグネチャ・型定義に関する正規表現
const SIGNATURE_PATTERNS = [
  // function 定義
  /\bfunction\s+([a-zA-Z0-9_$]+)/,
  // class / interface / type / enum 定義
  /\b(?:export\s+)?(?:default\s+)?(?:class|interface|type|enum|struct|trait)\s+([a-zA-Z0-9_$]+)/,
  // アロー関数や関数代入
  /\b(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/,
  // Python / Rust / Go 等の関数定義
  /\b(?:def|fn|func)\s+([a-zA-Z0-9_$]+)/,
];

// エラーハンドリングに関する正規表現
const ERROR_HANDLING_PATTERNS = [
  /\b(?:try|catch|finally|except)\b/,
  /\bif\s*\(\s*(?:err|error|e|!res\.ok|!response\.ok)\b/,
  /\.catch\s*\(/,
];

// シークレット・API トークン追加検出用正規表現
const SECRET_PATTERNS = [
  // 一般的な API キー・トークン・パスワードの代入
  /(?:api_?key|secret|token|password|auth_?token|client_?secret)[\s:=]+["'][a-zA-Z0-9_\-\.]{8,}["']/i,
  // GitHub トークン (ghp, gho, ghu, ghs, ghr)
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}/,
  // OpenAI API Key
  /sk-[a-zA-Z0-9]{20,}/,
  // Google API Key
  /AIza[0-9A-Za-z\-_]{35}/,
  // AWS Access Key ID
  /AKIA[0-9A-Z]{16}/,
  // 秘密鍵ヘッダ
  /-----BEGIN (?:RSA )?PRIVATE KEY-----/,
];

function hasMatchingLine(lines: string[], patterns: RegExp[]): boolean {
  for (const line of lines) {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 差分 Hunk のリスクレベルおよびサマリータグを判定する。
 */
export function analyzeRisk(
  hunk: DiffHunkRaw,
  noiseResult: NoiseAnalysisResult,
): RiskAnalysisResult {
  const { leftLines, rightLines } = hunk;
  const deletedCount = leftLines.length;
  const insertedCount = rightLines.length;
  const reasons: string[] = [];

  // ノイズの場合は normal かつ Format タグ
  if (noiseResult.isNoise) {
    const tag = noiseResult.noiseReason === "comment"
      ? "[Format] Comment only"
      : "[Format] Whitespace/Indentation";
    return {
      riskLevel: "normal",
      summaryTag: tag,
      reasons: ["Formatting or comment changes only"],
    };
  }

  // --- 1. Danger 判定 ---

  // 1-1. 連続10行超の削除（11行以上の純粋削除、または追加がごく僅かで11行以上削除）
  if (deletedCount > 10) {
    reasons.push(`${deletedCount} lines deleted`);
    return {
      riskLevel: "danger",
      summaryTag: `[Risk] ${deletedCount} lines deleted`,
      reasons,
    };
  }

  // 1-2. 関数・クラス・インターフェース・型シグネチャの変更または削除
  const leftHasSignature = hasMatchingLine(leftLines, SIGNATURE_PATTERNS);
  const rightHasSignature = hasMatchingLine(rightLines, SIGNATURE_PATTERNS);

  if (leftHasSignature || rightHasSignature) {
    if (leftHasSignature && insertedCount === 0) {
      reasons.push("Type/Signature deleted");
      return {
        riskLevel: "danger",
        summaryTag: "[Risk] Type/Signature deleted",
        reasons,
      };
    } else if (leftHasSignature && rightHasSignature) {
      reasons.push("Type/Signature modified");
      return {
        riskLevel: "danger",
        summaryTag: "[Risk] Signature modified",
        reasons,
      };
    } else if (leftHasSignature) {
      reasons.push("Type/Signature replaced");
      return {
        riskLevel: "danger",
        summaryTag: "[Risk] Signature modified",
        reasons,
      };
    }
  }

  // --- 2. Warning 判定 ---

  // 2-1. エラーハンドリングの削除（Left に error pattern があり、Right にない）
  const leftHasErrorHandling = hasMatchingLine(
    leftLines,
    ERROR_HANDLING_PATTERNS,
  );
  const rightHasErrorHandling = hasMatchingLine(
    rightLines,
    ERROR_HANDLING_PATTERNS,
  );
  if (leftHasErrorHandling && !rightHasErrorHandling) {
    reasons.push("Error handling removed");
    return {
      riskLevel: "warning",
      summaryTag: "[Risk] Error handling removed",
      reasons,
    };
  }

  // 2-2. ハードコードされたシークレットの追加（Right に secret pattern があり、Left にない）
  const leftHasSecret = hasMatchingLine(leftLines, SECRET_PATTERNS);
  const rightHasSecret = hasMatchingLine(rightLines, SECRET_PATTERNS);
  if (!leftHasSecret && rightHasSecret) {
    reasons.push("Potential secret added");
    return {
      riskLevel: "warning",
      summaryTag: "[Risk] Potential secret added",
      reasons,
    };
  }

  // --- 3. Normal 判定 ---
  let defaultTag: string;
  if (deletedCount > 0 && insertedCount > 0) {
    defaultTag = `[Edit] ~${Math.max(deletedCount, insertedCount)} lines`;
  } else if (deletedCount > 0) {
    defaultTag = `[Edit] -${deletedCount} lines`;
  } else {
    defaultTag = `[Edit] +${insertedCount} lines`;
  }

  return {
    riskLevel: "normal",
    summaryTag: defaultTag,
    reasons: ["Standard code change"],
  };
}
