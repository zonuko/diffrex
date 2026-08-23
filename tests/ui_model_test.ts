import { assertEquals } from "@std/assert";
import { Observable } from "../src/ui/model/observable.ts";
import { DiffSessionModel } from "../src/ui/model/diff_session_model.ts";
import type { Chunk } from "@codemirror/merge";
import type { DiffSessionData } from "../src/core/types.ts";

Deno.test("Observable: 購読、通知、購読解除が正しく機能する", () => {
  const observable = new Observable<number>();
  const received: number[] = [];

  const unsubscribe = observable.subscribe((val) => {
    received.push(val);
  });

  assertEquals(observable.observerCount, 1);

  observable.notify(10);
  observable.notify(20);

  assertEquals(received, [10, 20]);

  unsubscribe();
  assertEquals(observable.observerCount, 0);

  observable.notify(30);
  assertEquals(received, [10, 20]); // 30 は届かない
});

Deno.test("Observable: 複数 Observer の登録と個別解除・一括クリア", () => {
  const observable = new Observable<string>();
  let countA = 0;
  let countB = 0;

  const unsubA = observable.subscribe(() => countA++);
  const _unsubB = observable.subscribe(() => countB++);

  assertEquals(observable.observerCount, 2);
  observable.notify("test");
  assertEquals(countA, 1);
  assertEquals(countB, 1);

  unsubA();
  assertEquals(observable.observerCount, 1);
  observable.notify("test2");
  assertEquals(countA, 1);
  assertEquals(countB, 2);

  observable.clear();
  assertEquals(observable.observerCount, 0);
  observable.notify("test3");
  assertEquals(countB, 2);
});

Deno.test("DiffSessionModel: 初期状態とセッション設定", () => {
  const model = new DiffSessionModel();
  assertEquals(model.session, null);
  assertEquals(model.connectionStatus, "connecting");
  assertEquals(model.chunks, []);
  assertEquals(model.activeChunkIndex, 0);
  assertEquals(model.mode, "navigation");
  assertEquals(model.statusMessage, "");

  let notifiedCount = 0;
  model.subscribe(() => {
    notifiedCount++;
  });

  const sampleSession: DiffSessionData = {
    sessionId: "test-id",
    timestamp: "2026-08-17T00:00:00Z",
    mode: "2way",
    files: {
      left: { path: "left.txt", content: "left", readOnly: true },
      right: { path: "right.txt", content: "right", readOnly: false },
    },
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
    hunks: [],
  };

  model.setSession(sampleSession);
  assertEquals(model.session?.sessionId, "test-id");
  assertEquals(notifiedCount, 1);
});

Deno.test("DiffSessionModel: setChunks と Hunk ナビゲーション (次/前/ラップアラウンド)", () => {
  const model = new DiffSessionModel();
  const mockChunks: Chunk[] = [
    { fromA: 0, toA: 5, fromB: 0, toB: 10 } as unknown as Chunk,
    { fromA: 10, toA: 15, fromB: 20, toB: 25 } as unknown as Chunk,
    { fromA: 20, toA: 25, fromB: 30, toB: 35 } as unknown as Chunk,
  ];

  model.setChunks(mockChunks);
  assertEquals(model.chunks.length, 3);
  assertEquals(model.activeChunkIndex, 0);
  assertEquals(model.activeChunk, mockChunks[0]);

  // 次へ移動
  model.selectNextHunk();
  assertEquals(model.activeChunkIndex, 1);

  model.selectNextHunk();
  assertEquals(model.activeChunkIndex, 2);

  // 末尾から先頭へラップアラウンド
  model.selectNextHunk();
  assertEquals(model.activeChunkIndex, 0);

  // 先頭から末尾へラップアラウンド
  model.selectPrevHunk();
  assertEquals(model.activeChunkIndex, 2);

  model.selectPrevHunk();
  assertEquals(model.activeChunkIndex, 1);

  // 直接インデックス指定
  model.setActiveChunkIndex(0);
  assertEquals(model.activeChunkIndex, 0);

  // 範囲外インデックス指定のクランプ
  model.setActiveChunkIndex(100);
  assertEquals(model.activeChunkIndex, 2);
  model.setActiveChunkIndex(-5);
  assertEquals(model.activeChunkIndex, 0);
});

Deno.test("DiffSessionModel: chunks が空の場合の挙動", () => {
  const model = new DiffSessionModel();
  model.setChunks([]);

  assertEquals(model.chunks.length, 0);
  assertEquals(model.activeChunkIndex, -1);
  assertEquals(model.activeChunk, null);
  assertEquals(model.statusMessage, "すべての差分が解消されました");

  // 空の状態でナビゲーションしてもエラーにならない
  model.selectNextHunk();
  assertEquals(model.activeChunkIndex, -1);
  model.selectPrevHunk();
  assertEquals(model.activeChunkIndex, -1);
});

Deno.test("DiffSessionModel: モード・ステータス変更と通知", () => {
  const model = new DiffSessionModel();
  let notifications = 0;
  model.subscribe(() => notifications++);

  model.setMode("editing");
  assertEquals(model.mode, "editing");
  assertEquals(notifications, 1);

  // 同一値は通知しない
  model.setMode("editing");
  assertEquals(notifications, 1);

  model.setConnectionStatus("connected");
  assertEquals(model.connectionStatus, "connected");
  assertEquals(notifications, 2);

  model.setStatusMessage("保存しました");
  assertEquals(model.statusMessage, "保存しました");
  assertEquals(notifications, 3);

  model.setSaveStatus({ status: "saved", message: "OK" });
  assertEquals(model.saveStatus.status, "saved");
  assertEquals(notifications, 4);
});

Deno.test("DiffSessionModel: isDirty 状態管理と保存完了時のリセット", () => {
  const model = new DiffSessionModel();
  assertEquals(model.isDirty, false);

  model.setDirty(true);
  assertEquals(model.isDirty, true);

  // 保存成功時に isDirty が false にリセットされること
  model.setSaveStatus({ status: "saved", message: "Saved" });
  assertEquals(model.isDirty, false);

  model.setDirty(true);
  assertEquals(model.isDirty, true);

  // 保存エラー時は isDirty が維持されること
  model.setSaveStatus({ status: "error", message: "Failed" });
  assertEquals(model.isDirty, true);
});
