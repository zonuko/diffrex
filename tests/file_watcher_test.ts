/**
 * FileWatcher および外部ファイル変更ハンドリングのテスト（B16-06）。
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { join } from "@std/path";
import { FileWatcher, normalizeWatcherPath } from "../src/core/watcher.ts";
import { TabContainerModel } from "../src/ui/model/tab_model.ts";
import { TabController } from "../src/ui/controller/tab_controller.ts";
import type {
  BackendToUiMessage,
  UiToBackendMessage,
} from "../src/desktop/ipc.ts";
import type {
  DiffSessionData,
  DirectoryDiffSessionData,
  DirectoryTreeNode,
} from "../src/core/types.ts";
import { startDesktopServer } from "../src/desktop/window.ts";

function createDummyDiffSession(
  leftPath: string,
  rightPath: string,
): DiffSessionData {
  return {
    sessionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    mode: "2way",
    files: {
      left: { path: leftPath, content: "original left", readOnly: true },
      right: { path: rightPath, content: "original right", readOnly: false },
    },
    hunks: [],
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
  };
}

Deno.test("FileWatcher: ファイル外部変更イベントの検知とデバウンス処理 (B16-01)", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_watcher_test_" });
  const testFile = join(tempDir, "test.txt");
  await Deno.writeTextFile(testFile, "hello");

  const watcher = new FileWatcher({ debounceMs: 50, selfSaveWindowMs: 1000 });
  const events: string[] = [];

  watcher.onChange((e) => {
    events.push(e.path);
  });

  watcher.registerPath(testFile);

  // 少し待機して監視を開始
  await new Promise((r) => setTimeout(r, 100));

  // ファイルを外部から更新
  await Deno.writeTextFile(testFile, "hello updated");

  // デバウンス時間 + α 待機
  await new Promise((r) => setTimeout(r, 200));

  assertEquals(events.length, 1);
  assertEquals(
    normalizeWatcherPath(events[0]),
    normalizeWatcherPath(testFile),
  );

  watcher.close();
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("FileWatcher: Diffrex 自身による保存の除外 (self-save suppression) (B16-01)", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "diffrex_watcher_selfsave_",
  });
  const testFile = join(tempDir, "self.txt");
  await Deno.writeTextFile(testFile, "initial");

  const watcher = new FileWatcher({ debounceMs: 50, selfSaveWindowMs: 1000 });
  const events: string[] = [];

  watcher.onChange((e) => {
    events.push(e.path);
  });

  watcher.registerPath(testFile);
  await new Promise((r) => setTimeout(r, 100));

  // 自己保存フラグを設定
  watcher.markSelfSave(testFile, 1500);

  // 自己保存による書き込み
  await Deno.writeTextFile(testFile, "saved by diffrex");

  // 待機してもイベントが発行されないことを検証
  await new Promise((r) => setTimeout(r, 200));
  assertEquals(events.length, 0);

  watcher.close();
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("TabController: 未編集（Clean）時の自動再読み込み (B16-03)", () => {
  const model = new TabContainerModel();
  const sentMessages: UiToBackendMessage[] = [];
  const controller = new TabController(model, {
    onSendMessage: (msg) => {
      sentMessages.push(msg);
    },
  });

  const session = createDummyDiffSession("left.txt", "right.txt");
  const tab = controller.openDiffSession(session, true);

  // タブはクリーン（未編集）状態
  assertEquals(tab.isDirty, false);

  // 外部から right.txt が変更された通知
  controller.handleFileChanged({
    path: "right.txt",
    target: "right",
    mtime: Date.now(),
    content: "new remote content",
  });

  // 自動的に再読み込みリクエストが送信され、競合モーダルは開かない
  assertEquals(model.pendingExternalConflict, null);
  assertEquals(sentMessages.length, 1);
  assertEquals(sentMessages[0].type, "file:reload_request");
});

Deno.test("TabController: 編集中（Dirty）時の競合通知ダイアログとユーザー選択 (B16-03)", () => {
  const model = new TabContainerModel();
  const sentMessages: UiToBackendMessage[] = [];
  const controller = new TabController(model, {
    onSendMessage: (msg) => {
      sentMessages.push(msg);
    },
  });

  const session = createDummyDiffSession("left.txt", "right.txt");
  const tab = controller.openDiffSession(session, true);

  // 編集して Dirty 状態にする
  tab.diffModel!.setDirty(true);
  assertEquals(model.activeTab?.isDirty, true);

  // 外部から変更通知を受信
  controller.handleFileChanged({
    path: "right.txt",
    target: "right",
    mtime: Date.now(),
    content: "external update",
  });

  // 自動再読み込みされず、競合通知ダイアログ状態（pendingExternalConflict）になる
  assertNotEquals(model.pendingExternalConflict, null);
  assertEquals(sentMessages.length, 0);
  assertEquals(model.pendingExternalConflict?.filePath, "right.txt");

  // 1. 「現在の編集を保持」を選択
  controller.resolveExternalConflict(false);
  assertEquals(model.pendingExternalConflict, null);
  assertEquals(model.activeTab?.isDirty, true);
  assertEquals(sentMessages.length, 0);

  // 再び外部変更を受信
  controller.handleFileChanged({
    path: "right.txt",
    target: "right",
    mtime: Date.now(),
    content: "external update 2",
  });
  assertNotEquals(model.pendingExternalConflict, null);

  // 2. 「再読み込み（編集を破棄）」を選択
  controller.resolveExternalConflict(true);
  assertEquals(model.pendingExternalConflict, null);
  assertEquals(model.activeTab?.isDirty, false);
  assertEquals(sentMessages.length, 1);
  assertEquals(sentMessages[0].type, "file:reload_request");
});

Deno.test("TabController: 手動再読み込みコマンド (B16-04)", () => {
  const model = new TabContainerModel();
  const sentMessages: UiToBackendMessage[] = [];
  const controller = new TabController(model, {
    onSendMessage: (msg) => {
      sentMessages.push(msg);
    },
  });

  const session = createDummyDiffSession("a.txt", "b.txt");
  controller.openDiffSession(session, true);

  // クリーン時: F5 キーショートカットまたは reloadCurrentTab で再読み込み
  const handled = controller.handleKeyDown({
    key: "F5",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: () => {},
  } as unknown as KeyboardEvent);
  assertEquals(handled, true);
  assertEquals(sentMessages.length, 1);
  assertEquals(sentMessages[0].type, "file:reload_request");

  // Ctrl+Shift+R でも同様
  const handledR = controller.handleKeyDown({
    key: "R",
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
    preventDefault: () => {},
  } as unknown as KeyboardEvent);
  assertEquals(handledR, true);
  assertEquals(sentMessages.length, 2);
  assertEquals(sentMessages[1].type, "file:reload_request");
});

Deno.test("DesktopServer: file:reload_request によるセッション再生成 (B16-02, B16-04)", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_server_reload_" });
  const leftFile = join(tempDir, "left.txt");
  const rightFile = join(tempDir, "right.txt");

  await Deno.writeTextFile(leftFile, "left v1\n");
  await Deno.writeTextFile(rightFile, "right v1\n");

  const session: DiffSessionData = {
    sessionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    mode: "2way",
    files: {
      left: { path: leftFile, content: "left v1\n", readOnly: true },
      right: { path: rightFile, content: "right v1\n", readOnly: false },
    },
    hunks: [],
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
  };

  const serverInstance = startDesktopServer(session, { port: 0 });

  const ws = new WebSocket(`ws://127.0.0.1:${serverInstance.port}/ws`);
  const receivedMessages: BackendToUiMessage[] = [];

  await new Promise<void>((resolve) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "ui:ready" }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as BackendToUiMessage;
      receivedMessages.push(msg);
      if (msg.type === "session:init") {
        resolve();
      }
    };
  });

  // 外部でファイルを書き換え
  await Deno.writeTextFile(rightFile, "right v2 modified\n");

  // 再読み込みリクエストを送信
  const reloadPromise = new Promise<void>((resolve) => {
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as BackendToUiMessage;
      receivedMessages.push(msg);
      if (
        msg.type === "session:init" &&
        msg.data.files.right.content.includes("v2")
      ) {
        resolve();
      }
    };
    ws.send(JSON.stringify({ type: "file:reload_request" }));
  });

  await reloadPromise;

  const lastInit = receivedMessages
    .filter((m): m is BackendToUiMessage & { type: "session:init" } =>
      m.type === "session:init"
    )
    .pop();
  assertEquals(lastInit?.data.files.right.content, "right v2 modified\n");

  ws.close();
  await serverInstance.close();
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("DesktopServer: ディレクトリ比較モードにおける外部更新連動 (B16-05)", async () => {
  const baseDir = await Deno.makeTempDir({ prefix: "diffrex_dir_base_" });
  const targetDir = await Deno.makeTempDir({ prefix: "diffrex_dir_target_" });

  await Deno.writeTextFile(join(baseDir, "f1.txt"), "hello base\n");
  await Deno.writeTextFile(join(targetDir, "f1.txt"), "hello target\n");

  const { compareDirectories } = await import("../src/core/dir_diff.ts");
  const dirSession = await compareDirectories(baseDir, targetDir);

  const serverInstance = startDesktopServer(dirSession, { port: 0 });

  const ws = new WebSocket(`ws://127.0.0.1:${serverInstance.port}/ws`);
  const receivedTreeData: DirectoryDiffSessionData[] = [];

  await new Promise<void>((resolve) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "ui:ready" }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as BackendToUiMessage;
      if (msg.type === "dir:tree_data") {
        receivedTreeData.push(msg.data);
        resolve();
      }
    };
  });

  // 少し待機してウォッチャーを開始
  await new Promise((r) => setTimeout(r, 100));

  // 外部から targetDir に新規ファイルを追加
  const newFilePromise = new Promise<void>((resolve) => {
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as BackendToUiMessage;
      if (msg.type === "dir:tree_data") {
        receivedTreeData.push(msg.data);
        // f2.txt がツリーに追加されたことを確認
        const hasF2 = msg.data.tree.children?.some((node: DirectoryTreeNode) =>
          node.relativePath === "f2.txt"
        );
        if (hasF2) {
          resolve();
        }
      }
    };
  });

  await Deno.writeTextFile(join(targetDir, "f2.txt"), "hello added file\n");

  await newFilePromise;

  assertEquals(receivedTreeData.length >= 2, true);
  const latest = receivedTreeData[receivedTreeData.length - 1];
  const f2Node = latest.tree.children?.find((n: DirectoryTreeNode) =>
    n.relativePath === "f2.txt"
  );
  assertNotEquals(f2Node, undefined);

  ws.close();
  await serverInstance.close();
  await Deno.remove(baseDir, { recursive: true });
  await Deno.remove(targetDir, { recursive: true });
});
