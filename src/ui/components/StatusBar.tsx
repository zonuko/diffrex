/**
 * StatusBar View コンポーネント (Smalltalk-80 MVC View)
 *
 * Model (DiffSessionModel) を購読し、Hunk 数やキーバインドガイド、セッション ID を描画する（i18n 対応）。
 */

import type { DiffSessionModel } from "../model/diff_session_model.ts";
import { useModel } from "../hooks/use_model.ts";
import { i18n } from "../i18n/i18n_model.ts";

export interface StatusBarProps {
  model: DiffSessionModel;
}

export function StatusBar({ model }: StatusBarProps) {
  useModel(model);
  useModel(i18n);

  const totalHunks = model.chunks.length;
  const activeHunkIndex = model.activeChunkIndex;
  const session = model.session;
  const message = model.statusMessage;
  const isReadOnly = model.isReadOnly;
  const isDirty = model.isDirty;
  const saveStatus = model.saveStatus.status;

  const isAllReviewed = model.isAllReviewed;

  const hunkInfo = totalHunks > 0
    ? i18n.t("statusBar.hunkInfo", {
      current: activeHunkIndex >= 0 ? activeHunkIndex + 1 : 0,
      total: totalHunks,
    })
    : i18n.t("statusBar.noDiffs");

  return (
    <footer class={`app-footer ${isAllReviewed ? "all-reviewed" : ""}`}>
      <div class="footer-left">
        <span class="footer-badge hunk-badge">{hunkInfo}</span>
        {isAllReviewed && (
          <span class="footer-badge review-complete-badge">
            {i18n.t("statusBar.allReviewed")}
          </span>
        )}
        {isReadOnly
          ? (
            <span class="footer-badge readonly-badge">
              {i18n.t("statusBar.readOnly")}
            </span>
          )
          : (
            <>
              {saveStatus === "saving" && (
                <span class="footer-badge saving-badge">
                  {i18n.t("statusBar.saving")}
                </span>
              )}
              {saveStatus === "saved" && !isDirty && (
                <span class="footer-badge saved-badge">
                  {i18n.t("statusBar.saved")}
                </span>
              )}
              {isDirty && (
                <span class="footer-badge dirty-badge">
                  {i18n.t("statusBar.modified")}
                </span>
              )}
            </>
          )}
        {message && <span class="footer-message">{message}</span>}
      </div>

      <div class="footer-center key-guide">
        <span class="key-item">
          <kbd>A</kbd> {i18n.t("statusBar.keys.accept")}
        </span>
        <span class="key-item">
          <kbd>R</kbd> {i18n.t("statusBar.keys.reject")}
        </span>
        <span class="key-item">
          <kbd>E</kbd> {i18n.t("statusBar.keys.edit")}
        </span>
        <span class="key-item">
          <kbd>Alt+↓</kbd>/<kbd>J</kbd> {i18n.t("statusBar.keys.next")}
        </span>
        <span class="key-item">
          <kbd>Alt+↑</kbd>/<kbd>K</kbd> {i18n.t("statusBar.keys.prev")}
        </span>
        <span class="key-item">
          <kbd>Ctrl+R</kbd> {i18n.t("statusBar.keys.merge")}
        </span>
        <span class="key-item">
          <kbd>Ctrl+N</kbd> {i18n.t("statusBar.keys.noise")}
        </span>
        <span class="key-item">
          <kbd>Ctrl+S</kbd> {i18n.t("statusBar.keys.save")}
        </span>
        <span class="key-item">
          <kbd>Ctrl+Enter</kbd> {i18n.t("statusBar.keys.finish")}
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
