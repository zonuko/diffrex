/**
 * tests/semantic_analysis_test.ts
 *
 * TypeSafe Jev (System One) によるセマンティック差分解析のテスト (B19-02, B19-03, B19-05)。
 */

import { assertEquals } from "@std/assert";
import {
  analyzeHunksWithJev,
  analyzeHunkWithJev,
  buildHunkState,
} from "../src/core/analysis/semantic_analysis.ts";
import { JevClient } from "../src/core/analysis/jev_client.ts";
import type { HunkAnnotation } from "../src/core/types.ts";

Deno.test("semantic_analysis: buildHunkState がプロンプトと左右のコードを正しく整形する", () => {
  const hunk: HunkAnnotation = {
    id: "hunk-1",
    lineStartLeft: 1,
    lineEndLeft: 2,
    lineStartRight: 1,
    lineEndRight: 2,
    isNoise: false,
    riskLevel: "normal",
    status: "unreviewed",
  };

  const leftLines = ["const a = 1;", "const b = 2;"];
  const rightLines = ["const a = 10;", "const b = 20;"];
  const prompt = "Multiply values by 10";

  const state = buildHunkState(hunk, leftLines, rightLines, prompt);

  assertEquals(state.includes("[User Prompt / Instructions]"), true);
  assertEquals(state.includes("Multiply values by 10"), true);
  assertEquals(state.includes("const a = 1;\nconst b = 2;"), true);
  assertEquals(state.includes("const a = 10;\nconst b = 20;"), true);
});

Deno.test("semantic_analysis: API キー未設定時は静的解析を維持（Graceful Degradation）", async () => {
  const unconfiguredClient = new JevClient({ apiKey: "" });

  const hunk: HunkAnnotation = {
    id: "hunk-1",
    lineStartLeft: 1,
    lineEndLeft: 1,
    lineStartRight: 1,
    lineEndRight: 1,
    isNoise: false,
    riskLevel: "normal",
    status: "unreviewed",
  };

  const result = await analyzeHunkWithJev(
    hunk,
    ["foo();"],
    ["bar();"],
    "change foo to bar",
    unconfiguredClient,
  );

  assertEquals(result.analysisSource, "static");
  assertEquals(result.riskLevel, "normal");
});

Deno.test("semantic_analysis: Jev レスポンスから HunkAnnotation へのマッピング検証", async () => {
  const server = Deno.serve({ port: 0 }, () => {
    return Response.json({
      model: "jev-1.13.0",
      answers: {
        risk_level: {
          type: "choice",
          choice: "danger",
          confidence: 0.95,
          probabilities: { danger: 0.95, normal: 0.05 },
        },
        intent_alignment: {
          type: "score",
          score: 2,
          confidence: 0.9,
        },
        is_cosmetic_noise: {
          type: "noul",
          noul: 0.05,
        },
      },
    });
  });

  const port = (server.addr as Deno.NetAddr).port;
  const baseUrl = `http://127.0.0.1:${port}/v1/systemone`;

  try {
    const client = new JevClient({
      apiKey: "test-key",
      baseUrl,
    });

    const hunk: HunkAnnotation = {
      id: "hunk-1",
      lineStartLeft: 1,
      lineEndLeft: 2,
      lineStartRight: 1,
      lineEndRight: 2,
      isNoise: false,
      riskLevel: "normal",
      status: "unreviewed",
    };

    const analyzed = await analyzeHunkWithJev(
      hunk,
      ["deleteUser();"],
      ["deleteAllUsers();"],
      "allow deleting user",
      client,
    );

    assertEquals(analyzed.riskLevel, "danger");
    assertEquals(analyzed.confidence, 0.95);
    assertEquals(analyzed.intentAlignment, 2);
    assertEquals(analyzed.analysisSource, "jev");
    assertEquals(analyzed.isNoise, false);
  } finally {
    await server.shutdown();
  }
});

Deno.test("semantic_analysis: ハルシネーション（intent_alignment = 0）時に警告タグが付与される", async () => {
  const server = Deno.serve({ port: 0 }, () => {
    return Response.json({
      model: "jev-1.13.0",
      answers: {
        risk_level: {
          type: "choice",
          choice: "normal",
          confidence: 0.8,
        },
        intent_alignment: {
          type: "score",
          score: 0,
          confidence: 0.9,
        },
        is_cosmetic_noise: {
          type: "noul",
          noul: 0.0,
        },
      },
    });
  });

  const port = (server.addr as Deno.NetAddr).port;
  const baseUrl = `http://127.0.0.1:${port}/v1/systemone`;

  try {
    const client = new JevClient({
      apiKey: "test-key",
      baseUrl,
    });

    const hunk: HunkAnnotation = {
      id: "hunk-1",
      lineStartLeft: 1,
      lineEndLeft: 1,
      lineStartRight: 1,
      lineEndRight: 1,
      isNoise: false,
      riskLevel: "normal",
      status: "unreviewed",
    };

    const analyzed = await analyzeHunkWithJev(
      hunk,
      ["let count = 0;"],
      ["let score = 999;"],
      "Fix user login button color",
      client,
    );

    assertEquals(analyzed.intentAlignment, 0);
    assertEquals(analyzed.riskLevel, "warning");
    assertEquals(analyzed.summaryTag, "[AI] Intent mismatch / Unprompted edit");
  } finally {
    await server.shutdown();
  }
});

Deno.test("semantic_analysis: analyzeHunksWithJev による複数 Hunk の一括並列解析", async () => {
  const server = Deno.serve({ port: 0 }, () => {
    return Response.json({
      model: "jev-1.13.0",
      answers: {
        risk_level: {
          type: "choice",
          choice: "normal",
          confidence: 0.9,
        },
        intent_alignment: {
          type: "score",
          score: 2,
          confidence: 0.9,
        },
        is_cosmetic_noise: {
          type: "noul",
          noul: 0.85, // ノイズ判定
        },
      },
    });
  });

  const port = (server.addr as Deno.NetAddr).port;
  const baseUrl = `http://127.0.0.1:${port}/v1/systemone`;

  try {
    const client = new JevClient({
      apiKey: "test-key",
      baseUrl,
    });

    const hunks: HunkAnnotation[] = [
      {
        id: "hunk-1",
        lineStartLeft: 1,
        lineEndLeft: 1,
        lineStartRight: 1,
        lineEndRight: 1,
        isNoise: false,
        riskLevel: "normal",
        status: "unreviewed",
      },
      {
        id: "hunk-2",
        lineStartLeft: 5,
        lineEndLeft: 6,
        lineStartRight: 5,
        lineEndRight: 6,
        isNoise: false,
        riskLevel: "normal",
        status: "unreviewed",
      },
    ];

    const results = await analyzeHunksWithJev({
      hunks,
      leftContent: "line1\nline2\nline3\nline4\nline5\nline6",
      rightContent: "line1\nline2\nline3\nline4\nline5_mod\nline6_mod",
      prompt: "some instruction",
      jevClient: client,
    });

    assertEquals(results.length, 2);
    assertEquals(results[0].isNoise, true);
    assertEquals(results[1].isNoise, true);
    assertEquals(results[0].analysisSource, "jev");
  } finally {
    await server.shutdown();
  }
});
