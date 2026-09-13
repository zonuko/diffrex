/**
 * TabBar コンポーネント (B11-03 Smalltalk-80 MVC View)
 *
 * ウィンドウ上部（MenuBarの直下）に配置されるマルチタブバー。
 * タブ一覧の描画、アクティブタブ表示、新規タブ追加ボタン、
 * および未保存確認ダイアログの表示を管理する。
 */

import type { TabContainerModel } from "../model/tab_model.ts";
import type { TabController } from "../controller/tab_controller.ts";
import { TabItem } from "./TabItem.tsx";
import { TabCloseConfirmModal } from "./TabCloseConfirmModal.tsx";
import { useModel } from "../hooks/use_model.ts";

export interface TabBarProps {
  model: TabContainerModel;
  controller: TabController;
  onNewTabClick?: () => void;
}

export function TabBar({
  model,
  controller,
  onNewTabClick,
}: TabBarProps) {
  useModel(model);

  const tabs = model.tabs;
  const activeTabId = model.activeTabId;
  const pendingCloseTab = model.pendingCloseTab;

  return (
    <>
      <nav class="app-tab-bar" aria-label="セッションタブ">
        <div class="tab-list-container">
          {tabs.map((tab, idx) => (
            <TabItem
              key={tab.id}
              tab={tab}
              index={idx}
              isActive={tab.id === activeTabId}
              controller={controller}
            />
          ))}
        </div>

        <div class="tab-bar-actions">
          {onNewTabClick && (
            <button
              type="button"
              class="tab-new-btn"
              onClick={onNewTabClick}
              title="新しいセッションを開く (Ctrl+O)"
              aria-label="新しいセッションを開く"
            >
              ＋
            </button>
          )}
        </div>
      </nav>

      {/* 未保存変更があるタブを閉じる際の確認ダイアログ */}
      {pendingCloseTab && (
        <TabCloseConfirmModal
          tab={pendingCloseTab}
          controller={controller}
        />
      )}
    </>
  );
}
