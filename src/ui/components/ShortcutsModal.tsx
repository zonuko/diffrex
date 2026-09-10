/**
 * ShortcutsModal (B8-04 Smalltalk-80 MVC View)
 *
 * キーボードショートカット一覧ダイアログ。
 */

import type { MenuModel } from "../model/menu_model.ts";

export interface ShortcutsModalProps {
  model: MenuModel;
}

interface ShortcutSection {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "差分ナビゲーション",
    shortcuts: [
      { keys: ["Alt + ↓", "J"], description: "次の差分 (Hunk) に移動" },
      { keys: ["Alt + ↑", "K"], description: "前の差分 (Hunk) に移動" },
    ],
  },
  {
    title: "マージ & レビュー操作",
    shortcuts: [
      { keys: ["Ctrl + R"], description: "左の内容を右側へ適用 (マージ)" },
      { keys: ["Ctrl + L"], description: "右の内容を左側へ適用 (リバート)" },
      { keys: ["A"], description: "現在の Hunk を承認 (Accepted)" },
      { keys: ["R"], description: "現在の Hunk を拒否 (Rejected)" },
      { keys: ["E", "Enter"], description: "エディタ直接編集モードに入る" },
      { keys: ["Escape"], description: "ナビゲーションモードに戻る" },
      { keys: ["Alt + B"], description: "[3-Way] Base (共通祖先) を採用" },
      { keys: ["Alt + L"], description: "[3-Way] Left (Ours) を採用" },
      { keys: ["Alt + R"], description: "[3-Way] Right (Theirs) を採用" },
    ],
  },
  {
    title: "表示 & コマンド",
    shortcuts: [
      {
        keys: ["Ctrl + Shift + P"],
        description: "クイックコマンドパレットを開く",
      },
      {
        keys: ["Ctrl + N"],
        description: "ノイズ差分（空白・コメント）の折りたたみ切替",
      },
      {
        keys: ["Alt + F/E/M/V/G/H"],
        description: "メニューバーの各カテゴリを開く",
      },
      { keys: ["F1", "?"], description: "キーボードショートカット一覧を表示" },
    ],
  },
  {
    title: "ファイル & セッション",
    shortcuts: [
      { keys: ["Ctrl + S"], description: "編集内容を保存" },
      { keys: ["Ctrl + O"], description: "ファイル比較を開く" },
      { keys: ["Ctrl + Shift + O"], description: "フォルダ比較を開く" },
      { keys: ["Ctrl + Shift + T"], description: "直前のセッションを自動復元" },
      { keys: ["Ctrl + Q"], description: "Diffrex を終了" },
    ],
  },
];

export function ShortcutsModal({ model }: ShortcutsModalProps) {
  const handleClose = () => {
    model.setShortcutsModalOpen(false);
  };

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div
        class="modal-card shortcuts-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <div class="modal-header">
          <h2 id="shortcuts-title" class="modal-title">
            ⌨️ キーボードショートカット一覧
          </h2>
          <button
            type="button"
            class="modal-close-button"
            onClick={handleClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div class="modal-body shortcuts-modal-body">
          {SHORTCUT_SECTIONS.map((section) => (
            <div key={section.title} class="shortcuts-section">
              <h3 class="shortcuts-section-title">{section.title}</h3>
              <div class="shortcuts-table">
                {section.shortcuts.map((sc, idx) => (
                  <div key={idx} class="shortcuts-row">
                    <div class="shortcuts-keys">
                      {sc.keys.map((k, kIdx) => (
                        <span key={kIdx}>
                          {kIdx > 0 && <span class="shortcuts-or">/</span>}
                          <kbd class="shortcut-key">{k}</kbd>
                        </span>
                      ))}
                    </div>
                    <div class="shortcuts-desc">{sc.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="button primary"
            onClick={handleClose}
          >
            閉じる (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
