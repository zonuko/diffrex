/**
 * StatusBar View コンポーネント (Smalltalk-80 MVC View)
 *
 * Model (DiffSessionModel) を購読し、Hunk 数やキーバインドガイド、セッション ID を描画する。
 */

import type { DiffSessionModel } from "../model/diff_session_model.ts";
import { useModel } from "../hooks/use_model.ts";

export interface StatusBarProps {
  model: DiffSessionModel;
}

export function StatusBar({ model }: StatusBarProps) {
  useModel(model);

  const totalHunks = model.chunks.length;
  const activeHunkIndex = model.activeChunkIndex;
  const session = model.session;
  const message = model.statusMessage;
  const isReadOnly = model.isReadOnly;
  const isDirty = model.isDirty;
  const saveStatus = model.saveStatus.status;

  const isAllReviewed = model.isAllReviewed;

  const hunkInfo = totalHunks > 0
    ? `Hunk ${activeHunkIndex >= 0 ? activeHunkIndex + 1 : 0} / ${totalHunks}`
    : "No Diffs";

  return (
    <footer class={`app-footer ${isAllReviewed ? "all-reviewed" : ""}`}>
      <div class="footer-left">
        <span class="footer-badge hunk-badge">{hunkInfo}</span>
        {isAllReviewed && (
          <span class="footer-badge review-complete-badge">
            ✨ ALL REVIEWED
          </span>
        )}
        {isReadOnly
          ? <span class="footer-badge readonly-badge">READ-ONLY</span>
          : (
            <>
              {saveStatus === "saving" && (
                <span class="footer-badge saving-badge">SAVING...</span>
              )}
              {saveStatus === "saved" && !isDirty && (
                <span class="footer-badge saved-badge">SAVED</span>
              )}
              {isDirty && (
                <span class="footer-badge dirty-badge">MODIFIED *</span>
              )}
            </>
          )}
        {message && <span class="footer-message">{message}</span>}
      </div>

      <div class="footer-center key-guide">
        <span class="key-item">
          <kbd>A</kbd> 承認
        </span>
        <span class="key-item">
          <kbd>R</kbd> 拒否
        </span>
        <span class="key-item">
          <kbd>E</kbd> 編集
        </span>
        <span class="key-item">
          <kbd>Alt+↓</kbd>/<kbd>J</kbd> 次
        </span>
        <span class="key-item">
          <kbd>Alt+↑</kbd>/<kbd>K</kbd> 前
        </span>
        <span class="key-item">
          <kbd>Ctrl+R</kbd> マージ(→)
        </span>
        <span class="key-item">
          <kbd>Ctrl+N</kbd> ノイズ
        </span>
        <span class="key-item">
          <kbd>Ctrl+S</kbd> 保存
        </span>
        <span class="key-item">
          <kbd>Ctrl+Enter</kbd> 完了
        </span>
      </div>

      <div class="footer-right">
        <span>
          {session?.sessionId ? `ID: ${session.sessionId.slice(0, 8)}` : ""}
        </span>
      </div>
    </footer>
  );
}
