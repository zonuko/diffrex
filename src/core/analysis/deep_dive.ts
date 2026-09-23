/**
 * src/core/analysis/deep_dive.ts
 *
 * Confidence-Gated ハイブリッド・レビュー基盤: オンデマンド深掘りトリガー (B20-04)。
 *
 * 疑義のある Hunk（低確信度、高リスク、プロンプト意図乖離等）について、
 * ユーザーが詳細解説を求めた際に System Two LLM または
 * 高度なセマンティック分析エンジンを用いて詳細な自然言語解説を生成する。
 */

import type { HunkAnnotation } from "../types.ts";

export interface ExplainHunkParams {
  hunk: HunkAnnotation;
  leftContent: string;
  rightContent: string;
  prompt?: string;
  /** LLM プロバイダ（未指定時は環境変数やローカルヒューリスティック解説エンジン） */
  provider?: "heuristic" | "openai" | "anthropic" | "gemini" | "ollama";
}

export interface HunkExplanationResult {
  hunkId: string;
  explanation: string;
  provider: string;
  suggestedAction?: "accept" | "reject" | "review_carefully";
}

function safeGetEnv(key: string): string | undefined {
  try {
    return Deno.env.get(key);
  } catch {
    return undefined;
  }
}

/**
 * 疑義 Hunk の文脈・差分および Jev のスコアを基に、詳細な自然言語解説を生成する。
 */
export async function explainHunkWithSystemTwo(
  params: ExplainHunkParams,
): Promise<HunkExplanationResult> {
  const { hunk, leftContent, rightContent, prompt } = params;

  const leftLines = leftContent.split(/\r?\n/);
  const rightLines = rightContent.split(/\r?\n/);

  const leftSnippet = leftLines
    .slice(
      Math.max(0, hunk.lineStartLeft - 1),
      Math.max(0, hunk.lineEndLeft),
    )
    .join("\n") || "(none)";

  const rightSnippet = rightLines
    .slice(
      Math.max(0, hunk.lineStartRight - 1),
      Math.max(0, hunk.lineEndRight),
    )
    .join("\n") || "(none)";

  // System Two LLM（OpenAI, Anthropic 等）の API キーが存在する場合は連携可能
  const openaiKey = safeGetEnv("OPENAI_API_KEY");
  const anthropicKey = safeGetEnv("ANTHROPIC_API_KEY");

  if (params.provider === "openai" || (!params.provider && openaiKey)) {
    try {
      return await callOpenAiExplanation(
        hunk,
        leftSnippet,
        rightSnippet,
        prompt,
        openaiKey!,
      );
    } catch (err) {
      console.warn(
        "[DeepDive] OpenAI call failed, falling back to heuristic explanation:",
        err,
      );
    }
  }

  if (params.provider === "anthropic" || (!params.provider && anthropicKey)) {
    try {
      return await callAnthropicExplanation(
        hunk,
        leftSnippet,
        rightSnippet,
        prompt,
        anthropicKey!,
      );
    } catch (err) {
      console.warn(
        "[DeepDive] Anthropic call failed, falling back to heuristic explanation:",
        err,
      );
    }
  }

  // デフォルト: ルールベース＆セマンティックヒューリスティックによる詳細解説生成
  return generateHeuristicExplanation(hunk, leftSnippet, rightSnippet, prompt);
}

function generateHeuristicExplanation(
  hunk: HunkAnnotation,
  leftSnippet: string,
  rightSnippet: string,
  prompt?: string,
): HunkExplanationResult {
  const reasons: string[] = [];
  let suggestedAction: "accept" | "reject" | "review_carefully" =
    "review_carefully";

  // 1. プロンプト意図との照合
  if (hunk.intentAlignment === 0 && prompt) {
    reasons.push(
      `【プロンプト指示との乖離】\nユーザー指示「${prompt.trim()}」に関連しない変更が含まれており、AIのハルシネーションや余計な変更である可能性が高いです。`,
    );
    suggestedAction = "reject";
  } else if (hunk.intentAlignment === 1) {
    reasons.push(
      `【付随する追加変更】\n指示内容を満たしていますが、プロンプトで明示されていない追加の変更・リファクタリングが含まれています。`,
    );
  }

  // 2. リスクレベルの分析
  if (hunk.riskLevel === "danger") {
    reasons.push(
      `【破壊的変更の検出】\n既存ロジック・エラーハンドリング・セキュリティ機構の削除、または重大なAPI契約の破壊が懸念されます。`,
    );
    suggestedAction = "reject";
  } else if (hunk.riskLevel === "warning") {
    reasons.push(
      `【潜在的リスク】\nエッジケースの挙動変更や、未検証のリグレッションを引き起こす可能性があります。`,
    );
  }

  // 3. 確信度の分析
  if (hunk.confidence !== undefined) {
    const confPercent = Math.round(hunk.confidence * 100);
    if (hunk.confidence < 0.6) {
      reasons.push(
        `【モデル判定の低確信度 (${confPercent}%)】\nSystem One モデルによる変更内容の安全確信度が低いため、自動承認を回避し人間によるレビューが推奨されます。`,
      );
    } else {
      reasons.push(`【判定確信度】${confPercent}%`);
    }
  }

  // 4. 安全な変更の判定
  if (
    hunk.riskLevel === "normal" &&
    (hunk.confidence ?? 0) >= 0.85 &&
    suggestedAction !== "reject"
  ) {
    suggestedAction = "accept";
  }

  // 5. コード差分特徴
  const leftDelLines = leftSnippet.split("\n").length;
  const rightAddLines = rightSnippet.split("\n").length;
  reasons.push(
    `【コード変更規模】元コード ${leftDelLines} 行削除 / 変更後 ${rightAddLines} 行追加`,
  );

  const fullExplanation = [
    `### 🔍 Hunk ${hunk.id} のセマンティック深掘り解説`,
    ...reasons,
    `\n**推奨アクション**: ${
      suggestedAction === "reject"
        ? "❌ 拒否 (Reject) または手動修正を推奨"
        : suggestedAction === "accept"
        ? "✅ 承認 (Accept) 可能"
        : "⚠️ コードの文脈を慎重に確認してください"
    }`,
  ].join("\n\n");

  return {
    hunkId: hunk.id,
    explanation: fullExplanation,
    provider: "heuristic-deep-dive",
    suggestedAction,
  };
}

async function callOpenAiExplanation(
  hunk: HunkAnnotation,
  leftSnippet: string,
  rightSnippet: string,
  prompt: string | undefined,
  apiKey: string,
): Promise<HunkExplanationResult> {
  const systemPrompt =
    "You are an expert code reviewer. Explain why this code diff was flagged as suspicious or dangerous. Respond in Japanese with clear bullet points.";
  const userContent = [
    prompt ? `[User Prompt]: ${prompt}` : "",
    `[Original Code]:\n${leftSnippet}`,
    `[Modified Code]:\n${rightSnippet}`,
    `[Hunk Metadata]: Risk=${hunk.riskLevel}, Confidence=${hunk.confidence}, IntentAlignment=${hunk.intentAlignment}`,
    "Why was this flagged? Explain the risks and recommend an action.",
  ].filter(Boolean).join("\n\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API returned status ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ??
    "No explanation returned.";

  return {
    hunkId: hunk.id,
    explanation: text,
    provider: "openai:gpt-4o-mini",
    suggestedAction: hunk.riskLevel === "danger"
      ? "reject"
      : "review_carefully",
  };
}

async function callAnthropicExplanation(
  hunk: HunkAnnotation,
  leftSnippet: string,
  rightSnippet: string,
  prompt: string | undefined,
  apiKey: string,
): Promise<HunkExplanationResult> {
  const systemPrompt =
    "You are an expert code reviewer. Explain why this code diff was flagged as suspicious or dangerous. Respond in Japanese with clear bullet points.";
  const userContent = [
    prompt ? `[User Prompt]: ${prompt}` : "",
    `[Original Code]:\n${leftSnippet}`,
    `[Modified Code]:\n${rightSnippet}`,
    `[Hunk Metadata]: Risk=${hunk.riskLevel}, Confidence=${hunk.confidence}, IntentAlignment=${hunk.intentAlignment}`,
    "Why was this flagged? Explain the risks and recommend an action.",
  ].filter(Boolean).join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API returned status ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "No explanation returned.";

  return {
    hunkId: hunk.id,
    explanation: text,
    provider: "anthropic:claude-3-5-haiku",
    suggestedAction: hunk.riskLevel === "danger"
      ? "reject"
      : "review_carefully",
  };
}
