/**
 * TypeSafe Jev (System One) によるセマンティック差分解析 (B-19, B-20)。
 *
 * 差分（Hunk）と AI 生成時のプロンプトを照合し、
 * プロンプトの指示と合致しているか、意図しないロジック破壊がないかを
 * Jev System One モデルを用いて高速かつ型安全に評価する。
 */

import type { HunkAnnotation, RiskLevel } from "../types.ts";
import {
  ChoiceAnswer,
  JevClient,
  NoulAnswer,
  ScoreAnswer,
} from "./jev_client.ts";

export interface SemanticAnalysisParams {
  hunks: HunkAnnotation[];
  leftContent: string;
  rightContent: string;
  prompt?: string;
  jevClient?: JevClient;
}

/**
 * Hunk の差分内容から Jev に渡す State 文字列を構築する
 */
export function buildHunkState(
  hunk: HunkAnnotation,
  leftLines: string[],
  rightLines: string[],
  prompt?: string,
): string {
  const leftChunk = leftLines
    .slice(
      Math.max(0, hunk.lineStartLeft - 1),
      Math.max(0, hunk.lineEndLeft),
    )
    .join("\n");

  const rightChunk = rightLines
    .slice(
      Math.max(0, hunk.lineStartRight - 1),
      Math.max(0, hunk.lineEndRight),
    )
    .join("\n");

  const sections: string[] = [];

  if (prompt && prompt.trim().length > 0) {
    sections.push(`[User Prompt / Instructions]\n${prompt.trim()}`);
  }

  sections.push(
    `[Original Code (Base / Left: lines ${hunk.lineStartLeft}-${hunk.lineEndLeft})]\n${
      leftChunk || "(empty)"
    }`,
  );
  sections.push(
    `[Modified Code (Target / Right: lines ${hunk.lineStartRight}-${hunk.lineEndRight})]\n${
      rightChunk || "(empty)"
    }`,
  );

  return sections.join("\n\n");
}

/**
 * 単一 Hunk を Jev System One で解析し、アノテーションを更新する
 */
export async function analyzeHunkWithJev(
  hunk: HunkAnnotation,
  leftLines: string[],
  rightLines: string[],
  prompt?: string,
  client?: JevClient,
): Promise<HunkAnnotation> {
  const jev = client ?? new JevClient();
  if (!jev.isConfigured()) {
    return { ...hunk, analysisSource: "static" };
  }

  const state = buildHunkState(hunk, leftLines, rightLines, prompt);

  try {
    const response = await jev.systemOne({
      state,
      questions: {
        risk_level: {
          type: "choice",
          instructions:
            "Evaluate the risk level of this code change to the codebase and logic",
          criteria: {
            danger:
              "Critical logic destruction, security vulnerability, broken API contract, or large unwanted deletion",
            warning:
              "Removed error handling, unprompted refactoring, potential regression or edge-case bug",
            normal:
              "Expected and safe implementation, bug fix, or clean logic update",
          },
        },
        intent_alignment: {
          type: "score",
          instructions:
            "How well this code change aligns with the user prompt instructions",
          criteria: [
            "Completely unrelated to the prompt, or AI hallucination",
            "Partially related, but contains unprompted extra modifications",
            "Accurately aligns with the prompt instructions",
          ],
        },
        is_cosmetic_noise: {
          type: "noul",
          instructions:
            "Is this change purely cosmetic with zero functional/behavioral impact (whitespace, comments, formatting)?",
        },
      },
    });

    const riskAnswer = response.answers["risk_level"] as
      | ChoiceAnswer
      | undefined;
    const intentAnswer = response.answers["intent_alignment"] as
      | ScoreAnswer
      | undefined;
    const noiseAnswer = response.answers["is_cosmetic_noise"] as
      | NoulAnswer
      | undefined;

    let evaluatedRisk: RiskLevel = hunk.riskLevel;
    if (
      riskAnswer?.choice &&
      ["normal", "warning", "danger"].includes(riskAnswer.choice)
    ) {
      evaluatedRisk = riskAnswer.choice as RiskLevel;
    }

    let isNoise = hunk.isNoise;
    if (noiseAnswer && noiseAnswer.noul >= 0.8) {
      isNoise = true;
    }

    let summaryTag = hunk.summaryTag;
    if (intentAnswer && intentAnswer.score === 0 && prompt) {
      summaryTag = "[AI] Intent mismatch / Unprompted edit";
      if (evaluatedRisk === "normal") evaluatedRisk = "warning";
    } else if (evaluatedRisk === "danger") {
      summaryTag = summaryTag || "[Jev] Critical modification";
    } else if (evaluatedRisk === "warning") {
      summaryTag = summaryTag || "[Jev] Potential risk";
    } else if (riskAnswer && riskAnswer.confidence >= 0.85) {
      summaryTag = summaryTag ||
        `[Safe] Verified (${Math.round(riskAnswer.confidence * 100)}%)`;
    }

    const result: HunkAnnotation = {
      ...hunk,
      riskLevel: evaluatedRisk,
      isNoise,
      confidence: riskAnswer?.confidence,
      intentAlignment: intentAnswer?.score,
      probabilities: riskAnswer?.probabilities,
      summaryTag,
      analysisSource: "jev",
    };

    console.log(
      `\x1b[35m[Semantic Analysis]\x1b[0m Hunk \x1b[33m${hunk.id}\x1b[0m evaluated -> ` +
        `Risk: \x1b[36m${evaluatedRisk}\x1b[0m, ` +
        `Noise: \x1b[36m${isNoise}\x1b[0m, ` +
        `Confidence: \x1b[32m${
          riskAnswer ? Math.round(riskAnswer.confidence * 100) + "%" : "N/A"
        }\x1b[0m, ` +
        `Intent: \x1b[36m${intentAnswer?.score ?? "N/A"}\x1b[0m`,
    );

    return result;
  } catch (err) {
    console.warn(
      `\x1b[33m[Jev]\x1b[0m Failed to semantically analyze hunk ${hunk.id}, retaining static analysis:`,
      err,
    );
    return { ...hunk, analysisSource: "static" };
  }
}

/**
 * 全 Hunk を Jev System One で並列解析し、更新された HunkAnnotation[] を返す
 */
export async function analyzeHunksWithJev(
  params: SemanticAnalysisParams,
): Promise<HunkAnnotation[]> {
  const { hunks, leftContent, rightContent, prompt, jevClient } = params;
  const jev = jevClient ?? new JevClient();

  if (!jev.isConfigured() || hunks.length === 0) {
    return hunks.map((h) => ({
      ...h,
      analysisSource: h.analysisSource ?? "static",
    }));
  }

  console.log(
    `\x1b[35m[Semantic Analysis]\x1b[0m 🔍 Analyzing ${hunks.length} hunks with Jev System One in parallel...`,
  );

  const leftLines = leftContent.split(/\r?\n/);
  const rightLines = rightContent.split(/\r?\n/);

  const analyzedHunks = await Promise.all(
    hunks.map((hunk) =>
      analyzeHunkWithJev(hunk, leftLines, rightLines, prompt, jev)
    ),
  );

  console.log(
    `\x1b[35m[Semantic Analysis]\x1b[0m ✅ Finished Jev semantic analysis for ${analyzedHunks.length} hunks.`,
  );

  return analyzedHunks;
}
