/**
 * TabCloseConfirmModal コンポーネント (B11-06 Smalltalk-80 MVC View)
 *
 * 未保存の変更があるタブを閉じる際の確認ダイアログ（i18n 対応）。
 * 「保存して閉じる」「保存しない（破棄）」「キャンセル」の3択を提供する。
 */

import { useEffect } from "preact/hooks";
import type { TabItem } from "../model/tab_model.ts";
import type { TabController } from "../controller/tab_controller.ts";
import { useModel } from "../hooks/use_model.ts";
import { i18n } from "../i18n/i18n_model.ts";

export interface TabCloseConfirmModalProps {
  tab: TabItem;
  controller: TabController;
}

export function TabCloseConfirmModal({
  tab,
  controller,
}: TabCloseConfirmModalProps) {
  useModel(i18n);

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
            {i18n.t("tabCloseConfirmModal.title")}
          </h3>
          <button
            type="button"
            class="modal-close-btn"
            onClick={() => controller.cancelCloseTab()}
            title={`${i18n.t("tabCloseConfirmModal.cancel")} (Escape)`}
          >
            ×
          </button>
        </div>

        <div class="modal-body">
          <p class="tab-confirm-message">
            {i18n.t("tabCloseConfirmModal.message", { title: tab.title })}
          </p>
          <p class="tab-confirm-submessage">
            {i18n.t("tabCloseConfirmModal.submessage")}
          </p>
        </div>

        <div class="modal-footer tab-confirm-footer">
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => controller.confirmCloseTab(true)}
          >
            {i18n.t("tabCloseConfirmModal.saveAndClose")}
          </button>
          <button
            type="button"
            class="btn btn-danger"
            onClick={() => controller.confirmCloseTab(false)}
          >
            {i18n.t("tabCloseConfirmModal.discardAndClose")}
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            onClick={() => controller.cancelCloseTab()}
          >
            {i18n.t("tabCloseConfirmModal.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
