/**
 * ExternalChangeConflictModal コンポーネント (B16-03 Smalltalk-80 MVC View)
 *
 * 編集中（Dirty）のファイルが外部で更新された際の競合通知ダイアログ。
 * 「最新の状態に再読み込み（現在の編集を破棄）」または「現在の編集を保持（外部変更を無視）」の安全な選択肢を提供する。
 */

import { useEffect } from "preact/hooks";
import type { ExternalConflictInfo } from "../model/tab_model.ts";
import type { TabController } from "../controller/tab_controller.ts";

export interface ExternalChangeConflictModalProps {
  conflict: ExternalConflictInfo;
  controller: TabController;
}

export function ExternalChangeConflictModal({
  conflict,
  controller,
}: ExternalChangeConflictModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        controller.resolveExternalConflict(false);
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [controller]);

  const displayName = conflict.relativePath ||
    conflict.filePath.split(/[/\\]/).pop() ||
    conflict.filePath;

  return (
    <div
      class="modal-backdrop"
      onClick={() => controller.resolveExternalConflict(false)}
    >
      <div
        class="modal-dialog tab-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-conflict-title"
      >
        <div class="modal-header">
          <h3 id="external-conflict-title" class="modal-title">
            ⚠️ ファイルが外部で変更されました
          </h3>
          <button
            type="button"
            class="modal-close-btn"
            onClick={() => controller.resolveExternalConflict(false)}
            title="現在の編集を保持して閉じる (Escape)"
          >
            ×
          </button>
        </div>

        <div class="modal-body">
          <p class="tab-confirm-message">
            <strong>"{displayName}"</strong>{" "}
            が外部エディタまたはツールによって変更されました。
          </p>
          <p class="tab-confirm-submessage">
            現在の未保存の編集を破棄して最新の内容を再読み込みしますか？
            それとも現在の編集を保持しますか？
          </p>
        </div>

        <div class="modal-footer tab-confirm-footer">
          <button
            type="button"
            class="btn btn-danger"
            onClick={() => controller.resolveExternalConflict(true)}
          >
            🔄 再読み込み（編集を破棄）
          </button>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => controller.resolveExternalConflict(false)}
          >
            🛡️ 現在の編集を保持
          </button>
        </div>
      </div>
    </div>
  );
}
