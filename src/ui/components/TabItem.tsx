/**
 * TabItem コンポーネント (B11-03 Smalltalk-80 MVC View)
 *
 * 単一タブの表示（アイコン、タイトル、Dirtyバッジ、閉じるボタン）と
 * マウスクリック・中クリック・ドラッグ＆ドロップ並び替えを処理する。
 */

import type { TabItem as TabItemData } from "../model/tab_model.ts";
import type { TabController } from "../controller/tab_controller.ts";

export interface TabItemProps {
  tab: TabItemData;
  index: number;
  isActive: boolean;
  controller: TabController;
}

export function TabItem({
  tab,
  index,
  isActive,
  controller,
}: TabItemProps) {
  const getIcon = (type: TabItemData["sessionType"]) => {
    switch (type) {
      case "3way":
        return "🔀";
      case "directory":
        return tab.title.startsWith("🌿") ? "🌿" : "📁";
      case "image":
        return "🖼️";
      case "csv":
        return "📊";
      case "welcome":
        return "🏠";
      case "2way":
      default:
        return "📄";
    }
  };

  const handleClick = () => {
    controller.switchTab(tab.id);
  };

  const handleAuxClick = (e: MouseEvent) => {
    // 中クリック（ホイールクリック）でタブを閉じる
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      controller.requestCloseTab(tab.id);
    }
  };

  const handleCloseClick = (e: MouseEvent) => {
    e.stopPropagation();
    controller.requestCloseTab(tab.id);
  };

  const handleDragStart = (e: DragEvent) => {
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", index.toString());
      e.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const fromIndexStr = e.dataTransfer?.getData("text/plain");
    if (fromIndexStr !== undefined && fromIndexStr !== "") {
      const fromIndex = parseInt(fromIndexStr, 10);
      if (!isNaN(fromIndex) && fromIndex !== index) {
        controller.reorderTabs(fromIndex, index);
      }
    }
  };

  return (
    <div
      class={`tab-item ${isActive ? "active" : ""} ${
        tab.isDirty ? "dirty" : ""
      }`}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      title={tab.relativePath ?? tab.title}
    >
      <span class="tab-icon">{getIcon(tab.sessionType)}</span>
      <span class="tab-title">{tab.title}</span>
      {tab.isDirty && (
        <span class="tab-dirty-indicator" title="未保存の変更">●</span>
      )}
      {tab.closable && (
        <button
          type="button"
          class="tab-close-btn"
          onClick={handleCloseClick}
          title="閉じる (Ctrl+W)"
          aria-label="閉じる"
        >
          ×
        </button>
      )}
    </div>
  );
}
