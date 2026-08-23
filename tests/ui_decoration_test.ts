import { assertEquals } from "@std/assert";
import { DiffSessionModel } from "../src/ui/model/diff_session_model.ts";
import { DiffController } from "../src/ui/controller/diff_controller.ts";
import type { Chunk } from "@codemirror/merge";
import type { DiffSessionData, HunkAnnotation } from "../src/core/types.ts";

function createMockHunk(
  id: string,
  isNoise: boolean,
  riskLevel: "normal" | "warning" | "danger" = "normal",
  status: "unreviewed" | "accepted" | "rejected" | "edited" = "unreviewed",
): HunkAnnotation {
  return {
    id,
    lineStartLeft: 1,
    lineEndLeft: 5,
    lineStartRight: 1,
    lineEndRight: 5,
    isNoise,
    riskLevel,
    status,
    summaryTag: isNoise ? "[Format] Indentation" : undefined,
  };
}

function createMockChunk(
  fromA: number,
  toA: number,
  fromB: number,
  toB: number,
): Chunk {
  return {
    fromA,
    toA,
    fromB,
    toB,
  } as Chunk;
}

function createMockSession(hunks: HunkAnnotation[]): DiffSessionData {
  return {
    sessionId: "test-session-4b",
    timestamp: new Date().toISOString(),
    mode: "2way",
    aiContext: {
      prompt: "AI prompt for testing UI decoration",
      agent: "Aider",
      model: "gpt-4o",
    },
    files: {
      left: { path: "left.ts", content: "left code", readOnly: true },
      right: { path: "right.ts", content: "right code", readOnly: false },
    },
    hunks,
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
  };
}

Deno.test("DiffSessionModel: noiseFolded 初期状態とトグル", () => {
  const model = new DiffSessionModel();
  // 初期値は true
  assertEquals(model.noiseFolded, true);

  let notified = 0;
  model.subscribe(() => {
    notified++;
  });

  model.toggleNoiseFolded();
  assertEquals(model.noiseFolded, false);
  assertEquals(notified, 1);

  model.setNoiseFolded(true);
  assertEquals(model.noiseFolded, true);
  assertEquals(notified, 2);

  // 同じ値なら通知しない
  model.setNoiseFolded(true);
  assertEquals(notified, 2);
});

Deno.test("DiffSessionModel: 個別 Hunk 折りたたみ・展開管理", () => {
  const model = new DiffSessionModel();
  assertEquals(model.isHunkFolded("hunk-1", true), true);
  assertEquals(model.isHunkFolded("hunk-1", false), false);

  // 個別展開
  model.toggleHunkFold("hunk-1");
  assertEquals(model.isHunkFolded("hunk-1", true), false);

  // 個別折りたたみ
  model.toggleHunkFold("hunk-1");
  assertEquals(model.isHunkFolded("hunk-1", true), true);

  // 一括展開時は個別が fold でも展開扱い
  model.setNoiseFolded(false);
  assertEquals(model.isHunkFolded("hunk-1", true), false);
});

Deno.test("DiffSessionModel: 統計ゲッター (unreviewed, noise, riskCounts)", () => {
  const hunks: HunkAnnotation[] = [
    createMockHunk("h1", true, "normal", "unreviewed"),
    createMockHunk("h2", false, "danger", "unreviewed"),
    createMockHunk("h3", false, "warning", "accepted"),
    createMockHunk("h4", false, "normal", "rejected"),
  ];

  const session = createMockSession(hunks);
  const model = new DiffSessionModel(session);

  assertEquals(model.unreviewedCount, 2);
  assertEquals(model.noiseCount, 1);
  assertEquals(model.riskCounts, {
    danger: 1,
    warning: 1,
    normal: 2,
  });
});

Deno.test("DiffSessionModel: 折りたたみ中 noise hunk のスキップナビゲーション", () => {
  const hunks: HunkAnnotation[] = [
    createMockHunk("h0", true, "normal"), // noise (folded)
    createMockHunk("h1", false, "danger"), // logic
    createMockHunk("h2", true, "normal"), // noise (folded)
    createMockHunk("h3", false, "warning"), // logic
  ];

  const chunks = [
    createMockChunk(0, 10, 0, 10),
    createMockChunk(20, 30, 20, 30),
    createMockChunk(40, 50, 40, 50),
    createMockChunk(60, 70, 60, 70),
  ];

  const session = createMockSession(hunks);
  const model = new DiffSessionModel(session);
  model.setChunks(chunks, 0);

  // noiseFolded = true の場合、h0 は noise のため、次を選択すると h1 (index: 1) にスキップ
  model.selectNextHunk();
  assertEquals(model.activeChunkIndex, 1);

  // 次を選択すると h2 (noise) をスキップして h3 (index: 3) へ
  model.selectNextHunk();
  assertEquals(model.activeChunkIndex, 3);

  // ラップアラウンドして h0 (noise) をスキップして h1 (index: 1) へ
  model.selectNextHunk();
  assertEquals(model.activeChunkIndex, 1);

  // 逆方向 (selectPrevHunk) も h3 (index: 3) へ
  model.selectPrevHunk();
  assertEquals(model.activeChunkIndex, 3);

  // 一括展開 (noiseFolded = false) にすると全 hunk を移動
  model.setNoiseFolded(false);
  model.selectNextHunk(); // 3 -> 0
  assertEquals(model.activeChunkIndex, 0);
  model.selectNextHunk(); // 0 -> 1
  assertEquals(model.activeChunkIndex, 1);
});

Deno.test("DiffController: Ctrl+N でのノイズ折りたたみトグル", () => {
  const model = new DiffSessionModel();
  const controller = new DiffController(model);

  assertEquals(model.noiseFolded, true);

  let defaultPrevented = false;
  const ctrlNEvent = {
    key: "n",
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    preventDefault: () => {
      defaultPrevented = true;
    },
  } as unknown as KeyboardEvent;

  controller.handleKeyDown(ctrlNEvent);
  assertEquals(defaultPrevented, true);
  assertEquals(model.noiseFolded, false);

  controller.handleKeyDown(ctrlNEvent);
  assertEquals(model.noiseFolded, true);
});
