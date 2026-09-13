/**
 * TabCloseConfirmModal コンポーネント (B11-06 Smalltalk-80 MVC View)
 *
 * 未保存の変更があるタブを閉じる際の確認ダイアログ。
 * 「保存して閉じる」「保存しない（破棄）」「キャンセル」の3択を提供する。
 */

import { useEffect } from "preact/hooks";
import type { TabItem } from "../model/tab_model.ts";
import type { TabController } from "../controller/tab_controller.ts";

export interface TabCloseConfirmModalProps {
  tab: TabItem;
  controller: TabController;
}

export function TabCloseConfirmModal({
  tab,
  controller,
}: TabCloseConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        controller.cancelCloseTab();
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [controller]);

  return (
    <div
      class="modal-backdrop"
      onClick={() => controller.cancelCloseTab()}
    >
      <div
        class="modal-dialog tab-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tab-confirm-title"
      >
        <div class="modal-header">
          <h3 id="tab-confirm-title" class="modal-title">
            ⚠️ 未保存の変更があります
          </h3>
          <button
            type="button"
            class="modal-close-btn"
            onClick={() => controller.cancelCloseTab()}
            title="キャンセル (Escape)"
          >
            ×
          </button>
        </div>

        <div class="modal-body">
          <p class="tab-confirm-message">
            <strong>"{tab.title}"</strong> への変更が保存されていません。
          </p>
          <p class="tab-confirm-submessage">
            閉じる前に変更を保存しますか？
          </p>
        </div>

        <div class="modal-footer tab-confirm-footer">
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => controller.confirmCloseTab(true)}
          >
            💾 保存して閉じる
          </button>
          <button
            type="button"
            class="btn btn-danger"
            onClick={() => controller.confirmCloseTab(false)}
          >
            🗑️ 保存せずに閉じる
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            onClick={() => controller.cancelCloseTab()}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
