/**
 * tests/ui_review_test.ts
 *
 * Phase 4-C: レビューアクション (A/R/E), ガターマーカー, レビュー統計, 全件完了通知のテスト
 */

import { assertEquals } from "@std/assert";
import { DiffSessionModel } from "../src/ui/model/diff_session_model.ts";
import { DiffController } from "../src/ui/controller/diff_controller.ts";
import { ReviewStatusMarker } from "../src/ui/components/DiffView.tsx";
import type { Chunk } from "@codemirror/merge";
import type { DiffSessionData } from "../src/core/types.ts";

function createMockSession(): DiffSessionData {
  return {
    sessionId: "test-review-session-1",
    timestamp: "2026-08-20T12:00:00.000Z",
    mode: "2way",
    files: {
      left: {
        path: "base.ts",
        content: "line1\nline2\nline3\nline4\n",
        readOnly: true,
      },
      right: {
        path: "target.ts",
        content: "line1_mod\nline2\nline3_mod\nline4_mod\n",
        readOnly: false,
      },
    },
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
      },
      {
        id: "hunk-2",
        lineStartLeft: 3,
        lineEndLeft: 3,
        lineStartRight: 3,
        lineEndRight: 3,
        isNoise: false,
        riskLevel: "warning",
        status: "unreviewed",
      },
      {
        id: "hunk-3",
        lineStartLeft: 4,
        lineEndLeft: 4,
        lineStartRight: 4,
        lineEndRight: 4,
        isNoise: false,
        riskLevel: "danger",
        status: "unreviewed",
      },
    ],
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
  };
}

const mockChunks: readonly Chunk[] = [
  { fromA: 0, toA: 5, fromB: 0, toB: 9 } as unknown as Chunk,
  { fromA: 12, toA: 17, fromB: 16, toB: 25 } as unknown as Chunk,
  { fromA: 18, toA: 23, fromB: 26, toB: 35 } as unknown as Chunk,
];

Deno.test("DiffSessionModel: 初期状態のレビュー統計と isAllReviewed", () => {
  const model = new DiffSessionModel(createMockSession());
  model.setChunks(mockChunks);

  assertEquals(model.unreviewedCount, 3);
  assertEquals(model.reviewedCount, 0);
  assertEquals(model.isAllReviewed, false);
  assertEquals(model.statusCounts, {
    unreviewed: 3,
    accepted: 0,
    rejected: 0,
    edited: 0,
  });
});

Deno.test("DiffSessionModel: acceptCurrentHunk で accepted になり次へ移動する (P4-12)", () => {
  const model = new DiffSessionModel(createMockSession());
  model.setChunks(mockChunks);

  let notified = 0;
  model.subscribe(() => notified++);

  assertEquals(model.activeChunkIndex, 0);
  model.acceptCurrentHunk();

  assertEquals(notified, 1);
  assertEquals(model.session?.hunks[0].status, "accepted");
  assertEquals(model.activeChunkIndex, 1); // 次の未レビュー hunk (index 1) に移動
  assertEquals(model.unreviewedCount, 2);
  assertEquals(model.statusCounts.accepted, 1);
});

Deno.test("DiffSessionModel: rejectCurrentHunk で rejected になり次へ移動する (P4-13)", () => {
  const model = new DiffSessionModel(createMockSession());
  model.setChunks(mockChunks);

  model.setActiveChunkIndex(1);
  model.rejectCurrentHunk();

  assertEquals(model.session?.hunks[1].status, "rejected");
  assertEquals(model.activeChunkIndex, 2); // 次の未レビュー hunk (index 2) に移動
  assertEquals(model.unreviewedCount, 2);
  assertEquals(model.statusCounts.rejected, 1);
});

Deno.test("DiffSessionModel: markCurrentHunkEdited で edited に遷移する (P4-14)", () => {
  const model = new DiffSessionModel(createMockSession());
  model.setChunks(mockChunks);

  model.setActiveChunkIndex(2);
  model.markCurrentHunkEdited();

  assertEquals(model.session?.hunks[2].status, "edited");
  assertEquals(model.unreviewedCount, 2);
  assertEquals(model.statusCounts.edited, 1);
});

Deno.test("DiffSessionModel: 全 Hunk レビュー完了時の通知メッセージ設定 (P4-16)", () => {
  const model = new DiffSessionModel(createMockSession());
  model.setChunks(mockChunks);

  model.acceptCurrentHunk(); // hunk 0 -> accepted, active=1
  model.rejectCurrentHunk(); // hunk 1 -> rejected, active=2
  model.acceptCurrentHunk(); // hunk 2 -> accepted, all reviewed!

  assertEquals(model.unreviewedCount, 0);
  assertEquals(model.reviewedCount, 3);
  assertEquals(model.isAllReviewed, true);
  assertEquals(model.statusCounts, {
    unreviewed: 0,
    accepted: 2,
    rejected: 1,
    edited: 0,
  });
  assertEquals(
    model.statusMessage,
    "✨ 全ての差分のレビューが完了しました (Ctrl+Enter で保存して終了)",
  );
});

Deno.test("DiffController: A, R, E キーバインドの解釈 (P4-12, P4-13, P4-14)", () => {
  const model = new DiffSessionModel(createMockSession());
  model.setChunks(mockChunks);
  const controller = new DiffController(model);

  // A キー (Accept)
  let prevented = false;
  controller.handleKeyDown({
    key: "a",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as KeyboardEvent);

  assertEquals(prevented, true);
  assertEquals(model.session?.hunks[0].status, "accepted");
  assertEquals(model.activeChunkIndex, 1);

  // R キー (Reject)
  prevented = false;
  controller.handleKeyDown({
    key: "r",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as KeyboardEvent);

  assertEquals(prevented, true);
  assertEquals(model.session?.hunks[1].status, "rejected");
  assertEquals(model.activeChunkIndex, 2);

  // E キー (Edit Mode)
  prevented = false;
  controller.handleKeyDown({
    key: "e",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as KeyboardEvent);

  assertEquals(prevented, true);
  assertEquals(model.mode, "editing");
});

Deno.test("ReviewStatusMarker: ガターマーカーの DOM 生成 (P4-15)", () => {
  // DOM のシミュレーション（環境依存確認）
  if (typeof document !== "undefined") {
    const mAccepted = new ReviewStatusMarker("accepted");
    const domAccepted = mAccepted.toDOM();
    assertEquals(domAccepted.textContent, "✓");
    assertEquals(domAccepted.className.includes("cm-review-accepted"), true);

    const mRejected = new ReviewStatusMarker("rejected");
    const domRejected = mRejected.toDOM();
    assertEquals(domRejected.textContent, "✗");
    assertEquals(domRejected.className.includes("cm-review-rejected"), true);

    const mEdited = new ReviewStatusMarker("edited");
    const domEdited = mEdited.toDOM();
    assertEquals(domEdited.textContent, "✎");
    assertEquals(domEdited.className.includes("cm-review-edited"), true);
  }
});
