/**
 * AboutModal (B8-04 Smalltalk-80 MVC View)
 *
 * アプリケーション情報ダイアログ。
 */

import type { MenuModel } from "../model/menu_model.ts";

export interface AboutModalProps {
  model: MenuModel;
}

export function AboutModal({ model }: AboutModalProps) {
  const handleClose = () => {
    model.setAboutModalOpen(false);
  };

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div
        class="modal-card about-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <div class="modal-header">
          <h2 id="about-title" class="modal-title">
            Diffrex について
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

        <div class="modal-body about-modal-body">
          <div class="about-logo-wrapper">
            <div class="about-logo-badge">⚡ DIFFREX</div>
          </div>

          <h3 class="about-app-name">Diffrex (ディフレクス)</h3>
          <p class="about-tagline">
            AI-Friendly Diff & Merge Tool for Deno Desktop
          </p>

          <div class="about-info-grid">
            <div class="about-info-label">バージョン:</div>
            <div class="about-info-value">v0.1.0 (MVP + B-14 + B-8)</div>

            <div class="about-info-label">ランタイム:</div>
            <div class="about-info-value">Deno v2.9+ / Deno Desktop</div>

            <div class="about-info-label">UI エンジン:</div>
            <div class="about-info-value">
              Preact + CodeMirror 6 + Smalltalk-80 MVC
            </div>

            <div class="about-info-label">アーキテクチャ:</div>
            <div class="about-info-value">
              Pure TypeScript Observer Pattern (外部ライブラリ不使用)
            </div>
          </div>

          <p class="about-description">
            Diffrex は、AI
            生成コードの高速レビューと安全なマージを支援するデスクトップ差分ツールです。
            プロンプトやモデルメタデータの可視化、空白・コメントなどのノイズ差分の自動折りたたみ、
            秘密情報やシグネチャ変更などのリスク検知、3-Way
            マージ、画像・CSV比較、Git Worktree 連携を強力にサポートします。
          </p>

          <div class="about-links">
            <a
              href="https://github.com/zonuko/diffrex"
              target="_blank"
              rel="noopener noreferrer"
              class="about-link"
            >
              GitHub リポジトリ
            </a>
          </div>
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
