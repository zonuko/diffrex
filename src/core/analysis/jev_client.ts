/**
 * TypeSafe AI Jev (System One) API クライアント (B-19, B-20)。
 *
 * Deno 標準の fetch を用い、外部 SDK や重い依存なしに
 * 高速・構造化された判断（Choice, Score, Noul）と確信度を取得する。
 */

import "../env.ts";

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export interface NoulQuestion {
  type: "noul";
  instructions: string;
}

export type JevQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface JevSystemOneRequest {
  state: string;
  model?: string;
  questions: Record<string, JevQuestion>;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface ScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
}

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export type JevAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface JevSystemOneResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface JevClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * TypeSafe AI Jev クライアント
 */
export class JevClient {
  private apiKey: string | undefined;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(options?: JevClientOptions) {
    this.apiKey = options?.apiKey ?? Deno.env.get("TYPESAFE_API_KEY");
    this.baseUrl = options?.baseUrl ??
      Deno.env.get("TYPESAFE_API_URL") ??
      "https://api.typesafe.ai/v1/systemone";
    this.timeoutMs = options?.timeoutMs ?? 5000;
  }

  /**
   * API キーが設定されているかどうかを返す
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * System One API を呼び出し、構造化された判断結果を取得する
   */
  async systemOne(
    request: JevSystemOneRequest,
  ): Promise<JevSystemOneResponse> {
    if (!this.apiKey) {
      throw new Error("TYPESAFE_API_KEY is not configured.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const payload = {
      state: request.state,
      model: request.model ?? "jev-latest",
      questions: request.questions,
    };

    console.log(
      `\x1b[35m[Jev System One]\x1b[0m 🚀 Requesting \x1b[36m${this.baseUrl}\x1b[0m (model: ${payload.model})`,
    );
    console.log(
      `\x1b[35m[Jev System One]\x1b[0m Request Payload:\n${
        JSON.stringify(payload, null, 2)
      }`,
    );

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(
          `\x1b[31m[Jev System One] ❌ Error (${response.status} ${response.statusText}):\x1b[0m ${errorText}`,
        );
        throw new Error(
          `TypeSafe API error (${response.status} ${response.statusText}): ${errorText}`,
        );
      }

      const data = (await response.json()) as JevSystemOneResponse;
      console.log(
        `\x1b[32m[Jev System One] ✅ Response received (${response.status} ${response.statusText})\x1b[0m:`,
      );
      console.log(
        `\x1b[35m[Jev System One]\x1b[0m Response Body:\n${
          JSON.stringify(data, null, 2)
        }`,
      );
      return data;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        console.error(
          `\x1b[31m[Jev System One] ❌ Timeout after ${this.timeoutMs}ms\x1b[0m`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
