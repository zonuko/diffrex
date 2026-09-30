/**
 * AboutModal (B8-04 Smalltalk-80 MVC View)
 *
 * アプリケーション情報ダイアログ（i18n 対応）。
 */

import type { MenuModel } from "../model/menu_model.ts";
import { useModel } from "../hooks/use_model.ts";
import { i18n } from "../i18n/i18n_model.ts";

export interface AboutModalProps {
  model: MenuModel;
}

export function AboutModal({ model }: AboutModalProps) {
  useModel(i18n);

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
            {i18n.t("aboutModal.title")}
          </h2>
          <button
            type="button"
            class="modal-close-button"
            onClick={handleClose}
            aria-label={i18n.t("aboutModal.close")}
          >
            ×
          </button>
        </div>

        <div class="modal-body about-modal-body">
          <div class="about-logo-wrapper">
            <img
              src="/icon.svg"
              class="about-app-icon"
              alt="Diffrex"
              width="64"
              height="64"
            />
            <div class="about-logo-badge">⚡ DIFFREX</div>
          </div>

          <h3 class="about-app-name">{i18n.t("aboutModal.appName")}</h3>
          <p class="about-tagline">
            {i18n.t("aboutModal.tagline")}
          </p>

          <div class="about-info-grid">
            <div class="about-info-label">
              {i18n.t("aboutModal.versionLabel")}
            </div>
            <div class="about-info-value">v0.1.0 (MVP + B-14 + B-8 + B-18)</div>

            <div class="about-info-label">
              {i18n.t("aboutModal.runtimeLabel")}
            </div>
            <div class="about-info-value">Deno v2.9+ / Deno Desktop</div>

            <div class="about-info-label">
              {i18n.t("aboutModal.uiEngineLabel")}
            </div>
            <div class="about-info-value">
              Preact + CodeMirror 6 + Smalltalk-80 MVC
            </div>

            <div class="about-info-label">
              {i18n.t("aboutModal.architectureLabel")}
            </div>
            <div class="about-info-value">
              {i18n.t("aboutModal.architectureValue")}
            </div>
          </div>

          <p class="about-description">
            {i18n.t("aboutModal.description")}
          </p>

          <div class="about-links">
            <a
              href="https://github.com/zonuko/diffrex"
              target="_blank"
              rel="noopener noreferrer"
              class="about-link"
            >
              {i18n.t("aboutModal.githubRepo")}
            </a>
          </div>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="button primary"
            onClick={handleClose}
          >
            {i18n.t("aboutModal.close")} (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
