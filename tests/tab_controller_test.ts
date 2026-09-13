import { assertEquals } from "@std/assert";
import { TabContainerModel } from "../src/ui/model/tab_model.ts";
import { TabController } from "../src/ui/controller/tab_controller.ts";
import type { DiffSessionData } from "../src/core/types.ts";

function createMockSession(id: string, name: string): DiffSessionData {
  return {
    sessionId: id,
    timestamp: new Date().toISOString(),
    mode: "2way",
    files: {
      left: { path: `/left/${name}`, content: "left", readOnly: false },
      right: { path: `/right/${name}`, content: "right", readOnly: false },
    },
    hunks: [],
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
  };
}

Deno.test("TabController: openDiffSession と openWelcomeTab", () => {
  const model = new TabContainerModel();
  const controller = new TabController(model);

  const session1 = createMockSession("s1", "app.ts");
  const tab1 = controller.openDiffSession(session1);
  assertEquals(model.tabs.length, 1);
  assertEquals(tab1.title, "app.ts");
  assertEquals(model.activeTabId, tab1.id);

  const welcomeTab = controller.openWelcomeTab();
  assertEquals(model.tabs.length, 2);
  assertEquals(welcomeTab.title, "Welcome");
  assertEquals(model.activeTabId, "welcome");
});

Deno.test("TabController: 同一パスのセッション再オープン時にタブを再利用", () => {
  const model = new TabContainerModel();
  const controller = new TabController(model);

  const session1 = createMockSession("s1", "main.ts");
  const tab1 = controller.openDiffSession(session1, true, "src/main.ts");
  assertEquals(model.tabs.length, 1);

  // 同じ relativePath で再度オープン
  const tab1Again = controller.openDiffSession(session1, true, "src/main.ts");
  assertEquals(model.tabs.length, 1);
  assertEquals(tab1Again.id, tab1.id);
});

Deno.test("TabController: タブ切り替え操作 (switchTab, nextTab, prevTab, switchToIndex)", () => {
  const model = new TabContainerModel();
  const controller = new TabController(model);

  controller.openDiffSession(createMockSession("s1", "f1.ts"));
  controller.openDiffSession(createMockSession("s2", "f2.ts"));
  controller.openDiffSession(createMockSession("s3", "f3.ts"));

  assertEquals(model.tabs.length, 3);
  assertEquals(model.activeTabIndex, 2); // 最新が開かれた

  controller.prevTab();
  assertEquals(model.activeTabIndex, 1);

  controller.nextTab();
  assertEquals(model.activeTabIndex, 2);

  controller.switchToIndex(0);
  assertEquals(model.activeTabIndex, 0);
});

Deno.test("TabController: クリーンなタブのクローズと全削除時 Welcome フォールバック", () => {
  const model = new TabContainerModel();
  const controller = new TabController(model);

  const tab1 = controller.openDiffSession(createMockSession("s1", "f1.ts"));
  const tab2 = controller.openDiffSession(createMockSession("s2", "f2.ts"));

  assertEquals(model.tabs.length, 2);

  // tab2 を閉じる
  controller.requestCloseTab(tab2.id);
  assertEquals(model.tabs.length, 1);
  assertEquals(model.activeTabId, tab1.id);

  // tab1 を閉じる -> 全て閉じたので Welcome タブが自動生成される
  controller.requestCloseTab(tab1.id);
  assertEquals(model.tabs.length, 1);
  assertEquals(model.activeTab?.title, "Welcome");
});

Deno.test("TabController: Dirty タブのクローズ確認とキャンセル/破棄", async () => {
  const model = new TabContainerModel();
  const controller = new TabController(model);

  const tab1 = controller.openDiffSession(createMockSession("s1", "f1.ts"));
  // Dirty にする
  tab1.diffModel?.setDirty(true);

  // クローズをリクエスト -> 即座には閉じず、pendingCloseTabId が設定される
  controller.requestCloseTab(tab1.id);
  assertEquals(model.tabs.length, 1);
  assertEquals(model.pendingCloseTabId, tab1.id);

  // キャンセル
  controller.cancelCloseTab();
  assertEquals(model.pendingCloseTabId, null);
  assertEquals(model.tabs.length, 1);

  // 再度リクエストして、破棄（saveFirst=false）で確定
  controller.requestCloseTab(tab1.id);
  await controller.confirmCloseTab(false);
  assertEquals(model.pendingCloseTabId, null);
  // タブが閉じられたので Welcome に遷移
  assertEquals(model.activeTab?.title, "Welcome");
});

Deno.test("TabController: キーボードショートカット解釈", () => {
  const model = new TabContainerModel();
  const controller = new TabController(model);

  controller.openDiffSession(createMockSession("s1", "f1.ts"));
  controller.openDiffSession(createMockSession("s2", "f2.ts"));
  controller.openDiffSession(createMockSession("s3", "f3.ts"));

  let prevented = false;
  const mockPrevent = () => {
    prevented = true;
  };

  // 1. Ctrl+Tab (Next Tab)
  prevented = false;
  let handled = controller.handleKeyDown({
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    key: "Tab",
    preventDefault: mockPrevent,
  } as unknown as KeyboardEvent);
  assertEquals(handled, true);
  assertEquals(prevented, true);
  assertEquals(model.activeTabIndex, 0); // 2 -> 0 に循環

  // 2. Ctrl+Shift+Tab (Prev Tab)
  prevented = false;
  handled = controller.handleKeyDown({
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
    key: "Tab",
    preventDefault: mockPrevent,
  } as unknown as KeyboardEvent);
  assertEquals(handled, true);
  assertEquals(prevented, true);
  assertEquals(model.activeTabIndex, 2);

  // 3. Ctrl+2 (Index 1)
  prevented = false;
  handled = controller.handleKeyDown({
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    key: "2",
    preventDefault: mockPrevent,
  } as unknown as KeyboardEvent);
  assertEquals(handled, true);
  assertEquals(prevented, true);
  assertEquals(model.activeTabIndex, 1);

  // 4. Ctrl+W (Close Tab)
  prevented = false;
  handled = controller.handleKeyDown({
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    key: "w",
    preventDefault: mockPrevent,
  } as unknown as KeyboardEvent);
  assertEquals(handled, true);
  assertEquals(prevented, true);
  assertEquals(model.tabs.length, 2);
});
