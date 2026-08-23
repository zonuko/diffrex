/**
 * AI フレンドリー静的解析の統合エクスポートおよび Hunk 解析エントリーポイント (P4-04, P4-05, B-2)。
 */

import type { HunkAnnotation } from "../types.ts";
import { diffLinesToHunks } from "../diff.ts";
import { analyzeNoise } from "./noise.ts";
import { analyzeRisk } from "./risk.ts";
import {
  analyzeAstDiff,
  findMoveForHunk,
  findRenameForHunk,
} from "./ast/index.ts";

export * from "./noise.ts";
export * from "./risk.ts";
export * from "./ast/index.ts";

export interface AnalyzeDiffOptions {
  ignoreSpace?: boolean;
  ignoreComments?: boolean;
  filename?: string;
}

/**
 * 2 つのテキスト（Base と Target）を行単位で比較し、静的解析を行って HunkAnnotation[] を生成する。
 */
export function analyzeDiff(
  leftContent: string,
  rightContent: string,
  _options?: AnalyzeDiffOptions,
): HunkAnnotation[] {
  const rawHunks = diffLinesToHunks(leftContent, rightContent);

  return rawHunks.map((hunk, idx) => {
    const noiseResult = analyzeNoise(hunk);
    const riskResult = analyzeRisk(hunk, noiseResult);

    const annotation: HunkAnnotation = {
      id: `hunk-${idx + 1}`,
      lineStartLeft: hunk.lineStartLeft,
      lineEndLeft: hunk.lineEndLeft,
      lineStartRight: hunk.lineStartRight,
      lineEndRight: hunk.lineEndRight,
      isNoise: noiseResult.isNoise,
      noiseReason: noiseResult.noiseReason,
      riskLevel: riskResult.riskLevel,
      status: "unreviewed",
      summaryTag: riskResult.summaryTag,
    };

    return annotation;
  });
}

/**
 * AST セマンティック解析（Move / Rename 検知）を含めて HunkAnnotation[] を非同期生成する (B-2)。
 */
export async function analyzeDiffAsync(
  leftContent: string,
  rightContent: string,
  options?: AnalyzeDiffOptions,
): Promise<HunkAnnotation[]> {
  const annotations = analyzeDiff(leftContent, rightContent, options);
  const filename = options?.filename;
  if (!filename) return annotations;

  try {
    const astResult = await analyzeAstDiff(leftContent, rightContent, filename);
    if (!astResult) return annotations;

    for (const ann of annotations) {
      // 1. Move 判定
      const moveMatch = findMoveForHunk(
        ann.lineStartLeft,
        ann.lineEndLeft,
        ann.lineStartRight,
        ann.lineEndRight,
        astResult.moves,
      );
      if (moveMatch) {
        ann.isNoise = true;
        ann.noiseReason = "move";
        ann.summaryTag =
          `[Moved] ${moveMatch.annotation.nodeType} ${moveMatch.annotation.nodeName}`;
        ann.moveInfo = moveMatch.annotation;
        ann.riskLevel = "normal";
        continue;
      }

      // 2. Rename 判定
      const renameMatch = findRenameForHunk(
        ann.lineStartLeft,
        ann.lineEndLeft,
        ann.lineStartRight,
        ann.lineEndRight,
        astResult.renames,
      );
      if (renameMatch) {
        ann.isNoise = true;
        ann.noiseReason = "rename";
        ann.summaryTag = renameMatch.summaryTag;
        ann.riskLevel = "normal";
      }
    }
  } catch (err) {
    console.warn("[AST] Semantic diff error, falling back to line diff:", err);
  }

  return annotations;
}
