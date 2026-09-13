import { assertEquals } from "@std/assert";
import { TabContainerModel, type TabItem } from "../src/ui/model/tab_model.ts";

Deno.test("TabContainerModel: 初期状態とタブ追加", () => {
  const model = new TabContainerModel();
  assertEquals(model.tabs.length, 0);
  assertEquals(model.activeTabId, null);
  assertEquals(model.activeTab, null);
  assertEquals(model.activeTabIndex, -1);
  assertEquals(model.hasDirtyTabs, false);

  const tab1: TabItem = {
    id: "tab-1",
    title: "File 1",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };

  let notifyCount = 0;
  model.subscribe(() => {
    notifyCount++;
  });

  model.addTab(tab1);
  assertEquals(model.tabs.length, 1);
  assertEquals(model.activeTabId, "tab-1");
  assertEquals(model.activeTab?.title, "File 1");
  assertEquals(model.activeTabIndex, 0);
  assertEquals(notifyCount, 1);

  // 同一 ID のタブを追加した場合は更新
  const tab1Updated: TabItem = {
    ...tab1,
    title: "File 1 (Modified)",
  };
  model.addTab(tab1Updated);
  assertEquals(model.tabs.length, 1);
  assertEquals(model.activeTab?.title, "File 1 (Modified)");
  assertEquals(notifyCount, 2);
});

Deno.test("TabContainerModel: タブの切り替えとラップアラウンド", () => {
  const tab1: TabItem = {
    id: "t1",
    title: "T1",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };
  const tab2: TabItem = {
    id: "t2",
    title: "T2",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };
  const tab3: TabItem = {
    id: "t3",
    title: "T3",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };

  const model = new TabContainerModel([tab1, tab2, tab3]);
  assertEquals(model.activeTabId, "t1");
  assertEquals(model.activeTabIndex, 0);

  // nextTab (t1 -> t2 -> t3 -> t1)
  model.nextTab();
  assertEquals(model.activeTabId, "t2");
  model.nextTab();
  assertEquals(model.activeTabId, "t3");
  model.nextTab();
  assertEquals(model.activeTabId, "t1");

  // prevTab (t1 -> t3 -> t2)
  model.prevTab();
  assertEquals(model.activeTabId, "t3");
  model.prevTab();
  assertEquals(model.activeTabId, "t2");

  // switchToIndex
  model.switchToIndex(0);
  assertEquals(model.activeTabId, "t1");
  model.switchToIndex(2);
  assertEquals(model.activeTabId, "t3");
  // 範囲外インデックスは無視
  model.switchToIndex(99);
  assertEquals(model.activeTabId, "t3");
});

Deno.test("TabContainerModel: タブの削除とアクティブタブの自動調整", () => {
  const tab1: TabItem = {
    id: "t1",
    title: "T1",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };
  const tab2: TabItem = {
    id: "t2",
    title: "T2",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };
  const tab3: TabItem = {
    id: "t3",
    title: "T3",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };

  const model = new TabContainerModel([tab1, tab2, tab3]);
  model.setActiveTab("t2");
  assertEquals(model.activeTabId, "t2");

  // 真ん中のアクティブタブを削除 -> 後続（t3）がアクティブに
  const removed = model.removeTab("t2");
  assertEquals(removed?.id, "t2");
  assertEquals(model.tabs.length, 2);
  assertEquals(model.activeTabId, "t3");

  // 末尾のアクティブタブを削除 -> 手前（t1）がアクティブに
  model.removeTab("t3");
  assertEquals(model.tabs.length, 1);
  assertEquals(model.activeTabId, "t1");

  // 最後のタブを削除 -> activeTabId は null に
  model.removeTab("t1");
  assertEquals(model.tabs.length, 0);
  assertEquals(model.activeTabId, null);
});

Deno.test("TabContainerModel: タブの並び替え (moveTab)", () => {
  const tab1: TabItem = {
    id: "t1",
    title: "T1",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };
  const tab2: TabItem = {
    id: "t2",
    title: "T2",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };
  const tab3: TabItem = {
    id: "t3",
    title: "T3",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };

  const model = new TabContainerModel([tab1, tab2, tab3]);
  // 0番目を2番目へ移動 [t1, t2, t3] -> [t2, t3, t1]
  model.moveTab(0, 2);
  assertEquals(model.tabs.map((t) => t.id), ["t2", "t3", "t1"]);

  // 不正なインデックスは無視
  model.moveTab(-1, 1);
  assertEquals(model.tabs.map((t) => t.id), ["t2", "t3", "t1"]);
});

Deno.test("TabContainerModel: Dirty 状態とタイトルの更新", () => {
  const tab1: TabItem = {
    id: "t1",
    title: "T1",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };
  const tab2: TabItem = {
    id: "t2",
    title: "T2",
    sessionType: "2way",
    isDirty: false,
    closable: true,
  };

  const model = new TabContainerModel([tab1, tab2]);
  assertEquals(model.hasDirtyTabs, false);

  model.updateTabDirty("t1", true);
  assertEquals(model.tabs[0].isDirty, true);
  assertEquals(model.hasDirtyTabs, true);

  model.updateTabDirty("t1", false);
  assertEquals(model.hasDirtyTabs, false);

  model.updateTabTitle("t2", "New Title");
  assertEquals(model.tabs[1].title, "New Title");
});

Deno.test("TabContainerModel: 未保存保留中タブ (pendingCloseTab)", () => {
  const tab1: TabItem = {
    id: "t1",
    title: "T1",
    sessionType: "2way",
    isDirty: true,
    closable: true,
  };
  const model = new TabContainerModel([tab1]);
  assertEquals(model.pendingCloseTab, null);

  model.setPendingCloseTabId("t1");
  assertEquals(model.pendingCloseTabId, "t1");
  assertEquals(model.pendingCloseTab?.title, "T1");

  model.setPendingCloseTabId(null);
  assertEquals(model.pendingCloseTab, null);
});
