import { assertEquals } from "@std/assert";
import { DiffSessionModel } from "../src/ui/model/diff_session_model.ts";
import { DiffController } from "../src/ui/controller/diff_controller.ts";
import type { Chunk } from "@codemirror/merge";
import type { DiffSessionData } from "../src/core/types.ts";

Deno.test("DiffController: Hunk ナビゲーション指示が Model に反映される", () => {
  const model = new DiffSessionModel();
  const mockChunks: Chunk[] = [
    { fromA: 0, toA: 5, fromB: 0, toB: 10 } as unknown as Chunk,
    { fromA: 10, toA: 15, fromB: 20, toB: 25 } as unknown as Chunk,
  ];
  model.setChunks(mockChunks);

  const controller = new DiffController(model);
  assertEquals(model.activeChunkIndex, 0);

  controller.nextHunk();
  assertEquals(model.activeChunkIndex, 1);

  controller.nextHunk();
  assertEquals(model.activeChunkIndex, 0); // ラップアラウンド

  controller.prevHunk();
  assertEquals(model.activeChunkIndex, 1);
});

Deno.test("DiffController: handleChunksUpdated と handleCursorChunkSelect", () => {
  const model = new DiffSessionModel();
  const controller = new DiffController(model);

  const mockChunks: Chunk[] = [
    { fromA: 0, toA: 5, fromB: 0, toB: 10 } as unknown as Chunk,
    { fromA: 10, toA: 15, fromB: 20, toB: 25 } as unknown as Chunk,
  ];

  controller.handleChunksUpdated(mockChunks, 0);
  assertEquals(model.chunks.length, 2);
  assertEquals(model.activeChunkIndex, 0);

  controller.handleCursorChunkSelect(1);
  assertEquals(model.activeChunkIndex, 1);
});

Deno.test("DiffController: handleKeyDown によるナビゲーション入力の解釈", () => {
  const model = new DiffSessionModel();
  const mockChunks: Chunk[] = [
    { fromA: 0, toA: 5, fromB: 0, toB: 10 } as unknown as Chunk,
    { fromA: 10, toA: 15, fromB: 20, toB: 25 } as unknown as Chunk,
  ];
  model.setChunks(mockChunks);
  const controller = new DiffController(model);

  // 1. J キー (ナビゲーションモード) -> 次へ
  let prevented = false;
  controller.handleKeyDown({
    key: "j",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as KeyboardEvent);
  assertEquals(prevented, true);
  assertEquals(model.activeChunkIndex, 1);

  // 2. K キー (ナビゲーションモード) -> 前へ
  prevented = false;
  controller.handleKeyDown({
    key: "k",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as KeyboardEvent);
  assertEquals(prevented, true);
  assertEquals(model.activeChunkIndex, 0);

  // 3. Alt+ArrowDown -> 次へ
  prevented = false;
  controller.handleKeyDown({
    key: "ArrowDown",
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as KeyboardEvent);
  assertEquals(prevented, true);
  assertEquals(model.activeChunkIndex, 1);

  // 4. Alt+ArrowUp -> 前へ
  prevented = false;
  controller.handleKeyDown({
    key: "ArrowUp",
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as KeyboardEvent);
  assertEquals(prevented, true);
  assertEquals(model.activeChunkIndex, 0);
});

Deno.test("DiffController: IPC メッセージの受信処理 (session:init, save:result)", () => {
  const model = new DiffSessionModel();
  const controller = new DiffController(model);

  const sampleSession: DiffSessionData = {
    sessionId: "session-123",
    timestamp: "2026-08-17T00:00:00Z",
    mode: "2way",
    files: {
      left: { path: "left.ts", content: "left", readOnly: true },
      right: { path: "right.ts", content: "right", readOnly: false },
    },
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
    hunks: [],
  };

  // session:init
  controller.handleIpcMessage({
    type: "session:init",
    data: sampleSession,
  });
  assertEquals(model.session?.sessionId, "session-123");

  // save:result (成功)
  controller.handleIpcMessage({
    type: "save:result",
    success: true,
    message: "保存成功",
  });
  assertEquals(model.saveStatus.status, "saved");
  assertEquals(model.statusMessage, "保存成功");

  // save:result (失敗)
  controller.handleIpcMessage({
    type: "save:result",
    success: false,
    message: "権限エラー",
  });
  assertEquals(model.saveStatus.status, "error");
  assertEquals(model.statusMessage, "権限エラー");
});

Deno.test("DiffController: requestSave における readOnly ガード", () => {
  const model = new DiffSessionModel();
  const sampleSession: DiffSessionData = {
    sessionId: "session-ro",
    timestamp: "2026-08-17T00:00:00Z",
    mode: "2way",
    files: {
      left: { path: "left.ts", content: "left", readOnly: true },
      right: { path: "right.ts", content: "right", readOnly: true },
    },
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
    hunks: [],
  };
  model.setSession(sampleSession);

  const controller = new DiffController(model);
  controller.requestSave();

  assertEquals(model.statusMessage, "読み取り専用のため保存できません");
});

Deno.test("DiffController: Ctrl+S と Ctrl+Enter キーバインドの解釈", () => {
  const model = new DiffSessionModel();
  const sampleSession: DiffSessionData = {
    sessionId: "session-save-keys",
    timestamp: "2026-08-17T00:00:00Z",
    mode: "2way",
    files: {
      left: { path: "left.ts", content: "left", readOnly: true },
      right: { path: "right.ts", content: "right", readOnly: true },
    },
    options: { ignoreSpace: false, ignoreComments: false },
    hunks: [],
  };
  model.setSession(sampleSession);
  const controller = new DiffController(model);

  // Ctrl+S
  let prevented = false;
  controller.handleKeyDown({
    key: "s",
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as KeyboardEvent);
  assertEquals(prevented, true);
  assertEquals(model.statusMessage, "読み取り専用のため保存できません");

  // Ctrl+Enter
  prevented = false;
  controller.handleKeyDown({
    key: "Enter",
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as KeyboardEvent);
  assertEquals(prevented, true);
});

Deno.test("DiffController: handleDocumentChanged による isDirty 状態更新", () => {
  const model = new DiffSessionModel();
  const controller = new DiffController(model);

  assertEquals(model.isDirty, false);
  controller.handleDocumentChanged();
  assertEquals(model.isDirty, true);
});
