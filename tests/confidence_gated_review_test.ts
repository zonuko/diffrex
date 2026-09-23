/**
 * tests/confidence_gated_review_test.ts
 *
 * Confidence-Gated ハイブリッドレビュー基盤のテスト (B20-01, B20-02, B20-03, B20-06)。
 */

import { assertEquals } from "@std/assert";
import { DiffSessionModel } from "../src/ui/model/diff_session_model.ts";
import { DiffController } from "../src/ui/controller/diff_controller.ts";
import type { DiffSessionData, HunkAnnotation } from "../src/core/types.ts";

function createDummySession(hunks: HunkAnnotation[]): DiffSessionData {
  return {
    sessionId: "test-session",
    timestamp: new Date().toISOString(),
    mode: "2way",
    files: {
      left: { path: "a.ts", content: "const x = 1;", readOnly: true },
      right: { path: "b.ts", content: "const x = 2;", readOnly: false },
    },
    hunks,
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
  };
}

Deno.test("confidence_gated: safeCount と needsReviewCount の集計ロジック", () => {
  const hunks: HunkAnnotation[] = [
    // 1. Safe (confidence >= 0.85, normal)
    {
      id: "hunk-1",
      lineStartLeft: 1,
      lineEndLeft: 1,
      lineStartRight: 1,
      lineEndRight: 1,
      isNoise: false,
      riskLevel: "normal",
      status: "unreviewed",
      confidence: 0.9,
      analysisSource: "jev",
    },
    // 2. Needs Review (riskLevel: danger)
    {
      id: "hunk-2",
      lineStartLeft: 5,
      lineEndLeft: 5,
      lineStartRight: 5,
      lineEndRight: 5,
      isNoise: false,
      riskLevel: "danger",
      status: "unreviewed",
      confidence: 0.95,
      analysisSource: "jev",
    },
    // 3. Needs Review (confidence < 0.6)
    {
      id: "hunk-3",
      lineStartLeft: 10,
      lineEndLeft: 10,
      lineStartRight: 10,
      lineEndRight: 10,
      isNoise: false,
      riskLevel: "normal",
      status: "unreviewed",
      confidence: 0.45,
      analysisSource: "jev",
    },
    // 4. Needs Review (intentAlignment === 0)
    {
      id: "hunk-4",
      lineStartLeft: 15,
      lineEndLeft: 15,
      lineStartRight: 15,
      lineEndRight: 15,
      isNoise: false,
      riskLevel: "warning",
      status: "unreviewed",
      intentAlignment: 0,
      analysisSource: "jev",
    },
    // 5. 普通の変更 (confidence: 0.75, normal - safeでもneedsReviewでもない)
    {
      id: "hunk-5",
      lineStartLeft: 20,
      lineEndLeft: 20,
      lineStartRight: 20,
      lineEndRight: 20,
      isNoise: false,
      riskLevel: "normal",
      status: "unreviewed",
      confidence: 0.75,
      analysisSource: "jev",
    },
  ];

  const model = new DiffSessionModel(createDummySession(hunks));

  assertEquals(model.hasJevAnalysis, true);
  assertEquals(model.safeCount, 1); // hunk-1
  assertEquals(model.needsReviewCount, 3); // hunk-2, hunk-3, hunk-4
});

Deno.test("confidence_gated: updateHunkAnnotations で既存のレビュー状態 (status) を保持しながら更新", () => {
  const initialHunks: HunkAnnotation[] = [
    {
      id: "hunk-1",
      lineStartLeft: 1,
      lineEndLeft: 1,
      lineStartRight: 1,
      lineEndRight: 1,
      isNoise: false,
      riskLevel: "normal",
      status: "accepted", // ユーザーが既に承認済み
      analysisSource: "static",
    },
    {
      id: "hunk-2",
      lineStartLeft: 5,
      lineEndLeft: 5,
      lineStartRight: 5,
      lineEndRight: 5,
      isNoise: false,
      riskLevel: "normal",
      status: "unreviewed",
      analysisSource: "static",
    },
  ];

  const model = new DiffSessionModel(createDummySession(initialHunks));

  let notifyCalled = false;
  model.subscribe(() => {
    notifyCalled = true;
  });

  // Jev 解析結果を受信
  const jevUpdatedHunks: HunkAnnotation[] = [
    {
      id: "hunk-1",
      lineStartLeft: 1,
      lineEndLeft: 1,
      lineStartRight: 1,
      lineEndRight: 1,
      isNoise: false,
      riskLevel: "normal",
      status: "unreviewed", // Jev 側は unreviewed だが
      confidence: 0.92,
      analysisSource: "jev",
    },
    {
      id: "hunk-2",
      lineStartLeft: 5,
      lineEndLeft: 5,
      lineStartRight: 5,
      lineEndRight: 5,
      isNoise: false,
      riskLevel: "danger",
      status: "unreviewed",
      confidence: 0.88,
      analysisSource: "jev",
      summaryTag: "[Jev] Critical modification",
    },
  ];

  model.updateHunkAnnotations(jevUpdatedHunks);

  assertEquals(notifyCalled, true);
  const hunks = model.session!.hunks!;

  // hunk-1: ユーザーが承認した "accepted" が維持されていること
  assertEquals(hunks[0].status, "accepted");
  assertEquals(hunks[0].confidence, 0.92);
  assertEquals(hunks[0].analysisSource, "jev");

  // hunk-2: Jev の判定が適用されていること
  assertEquals(hunks[1].riskLevel, "danger");
  assertEquals(hunks[1].confidence, 0.88);
  assertEquals(hunks[1].summaryTag, "[Jev] Critical modification");
});

Deno.test("confidence_gated: DiffController による session:update_hunk_annotations IPC ハンドリング", () => {
  const initialHunks: HunkAnnotation[] = [
    {
      id: "hunk-1",
      lineStartLeft: 1,
      lineEndLeft: 1,
      lineStartRight: 1,
      lineEndRight: 1,
      isNoise: false,
      riskLevel: "normal",
      status: "unreviewed",
      analysisSource: "static",
    },
  ];

  const model = new DiffSessionModel(createDummySession(initialHunks));
  const controller = new DiffController(model);

  assertEquals(model.hasJevAnalysis, false);

  controller.handleIpcMessage({
    type: "session:update_hunk_annotations",
    hunks: [
      {
        id: "hunk-1",
        lineStartLeft: 1,
        lineEndLeft: 1,
        lineStartRight: 1,
        lineEndRight: 1,
        isNoise: false,
        riskLevel: "normal",
        status: "unreviewed",
        confidence: 0.95,
        analysisSource: "jev",
      },
    ],
  });

  assertEquals(model.hasJevAnalysis, true);
  assertEquals(model.safeCount, 1);
});

Deno.test("confidence_gated: explainHunkWithSystemTwo による深掘り解説生成 (B20-04)", async () => {
  const { explainHunkWithSystemTwo } = await import(
    "../src/core/analysis/deep_dive.ts"
  );

  const dangerHunk: HunkAnnotation = {
    id: "hunk-danger",
    lineStartLeft: 1,
    lineEndLeft: 3,
    lineStartRight: 1,
    lineEndRight: 1,
    isNoise: false,
    riskLevel: "danger",
    status: "unreviewed",
    confidence: 0.55,
    intentAlignment: 0,
    analysisSource: "jev",
  };

  const result = await explainHunkWithSystemTwo({
    hunk: dangerHunk,
    leftContent:
      "if (!auth.validate(req)) {\n  throw new Error('Unauthorized');\n}",
    rightContent: "// removed auth check",
    prompt: "Update user profile avatar",
  });

  assertEquals(result.hunkId, "hunk-danger");
  assertEquals(result.suggestedAction, "reject");
  assertEquals(result.explanation.includes("プロンプト指示との乖離"), true);
  assertEquals(result.explanation.includes("破壊的変更の検出"), true);
  assertEquals(result.explanation.includes("低確信度"), true);
});

Deno.test("confidence_gated: 深掘り解説の非同期リクエストとモデル反映 (B20-04)", () => {
  const model = new DiffSessionModel(
    createDummySession([
      {
        id: "hunk-1",
        lineStartLeft: 1,
        lineEndLeft: 1,
        lineStartRight: 1,
        lineEndRight: 1,
        isNoise: false,
        riskLevel: "danger",
        status: "unreviewed",
      },
    ]),
  );

  const controller = new DiffController(model);

  assertEquals(model.getExplainStatus("hunk-1"), "idle");
  assertEquals(model.getHunkExplanation("hunk-1"), undefined);

  // リクエスト発火
  model.setExplainLoading("hunk-1");
  assertEquals(model.getExplainStatus("hunk-1"), "loading");

  // バックエンドからレスポンス受信
  controller.handleIpcMessage({
    type: "hunk:explain_response",
    hunkId: "hunk-1",
    explanation: "This hunk removes a critical security check.",
    suggestedAction: "reject",
  });

  assertEquals(model.getExplainStatus("hunk-1"), "done");
  assertEquals(
    model.getHunkExplanation("hunk-1"),
    "This hunk removes a critical security check.",
  );
});

Deno.test("confidence_gated: 確信度しきい値の動的変更とトリアージ反映 (B20-05)", () => {
  try {
    localStorage.removeItem("diffrex:confidence_thresholds");
  } catch {
    // ignore
  }

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
      confidence: 0.88, // 初期設定 (safe: 0.85) では Safe
    },
    {
      id: "hunk-2",
      lineStartLeft: 5,
      lineEndLeft: 5,
      lineStartRight: 5,
      lineEndRight: 5,
      isNoise: false,
      riskLevel: "normal",
      status: "unreviewed",
      confidence: 0.65, // 初期設定 (needsReview: 0.60) では SafeでもNeedsReviewでもない
    },
  ];

  const model = new DiffSessionModel(createDummySession(hunks));

  // 初期集計: safe = 0.85, review = 0.60
  assertEquals(model.safeCount, 1);
  assertEquals(model.needsReviewCount, 0);

  // しきい値を厳格に変更: safe >= 0.90, review < 0.70
  model.setConfidenceThresholds({
    safe: 0.90,
    needsReview: 0.70,
  });

  // hunk-1 (0.88) は safe 0.90 未満となり Safe から除外される
  assertEquals(model.safeCount, 0);
  // hunk-2 (0.65) は review 0.70 未満となり Needs Review に入る
  assertEquals(model.needsReviewCount, 1);

  try {
    localStorage.removeItem("diffrex:confidence_thresholds");
  } catch {
    // ignore
  }
});

Deno.test("confidence_gated: メニューモデルにおける確信度設定モーダル状態管理 (B20-05)", async () => {
  const { MenuModel } = await import("../src/ui/model/menu_model.ts");
  const menuModel = new MenuModel();

  assertEquals(menuModel.isConfidenceSettingsModalOpen, false);

  menuModel.setConfidenceSettingsModalOpen(true);
  assertEquals(menuModel.isConfidenceSettingsModalOpen, true);

  // 他のモーダルを開くと自動的に閉じる（排他制御）
  menuModel.setAboutModalOpen(true);
  assertEquals(menuModel.isConfidenceSettingsModalOpen, false);
  assertEquals(menuModel.isAboutModalOpen, true);

  // 再び開く
  menuModel.setConfidenceSettingsModalOpen(true);
  assertEquals(menuModel.isConfidenceSettingsModalOpen, true);
  assertEquals(menuModel.isAboutModalOpen, false);
});
