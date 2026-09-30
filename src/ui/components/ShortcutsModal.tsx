/**
 * ShortcutsModal (B8-04 Smalltalk-80 MVC View)
 *
 * キーボードショートカット一覧ダイアログ（i18n 対応）。
 */

import type { MenuModel } from "../model/menu_model.ts";
import { useModel } from "../hooks/use_model.ts";
import { i18n } from "../i18n/i18n_model.ts";

export interface ShortcutsModalProps {
  model: MenuModel;
}

interface ShortcutSection {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

function getShortcutSections(): ShortcutSection[] {
  return [
    {
      title: i18n.t("shortcutsModal.sections.navigation"),
      shortcuts: [
        {
          keys: ["Alt + ↓", "J"],
          description: i18n.t("shortcutsModal.items.nextHunk"),
        },
        {
          keys: ["Alt + ↑", "K"],
          description: i18n.t("shortcutsModal.items.prevHunk"),
        },
      ],
    },
    {
      title: i18n.t("shortcutsModal.sections.mergeReview"),
      shortcuts: [
        {
          keys: ["Ctrl + R"],
          description: i18n.t("shortcutsModal.items.mergeLeftToRight"),
        },
        {
          keys: ["Ctrl + L"],
          description: i18n.t("shortcutsModal.items.mergeRightToLeft"),
        },
        {
          keys: ["A"],
          description: i18n.t("shortcutsModal.items.acceptHunk"),
        },
        {
          keys: ["R"],
          description: i18n.t("shortcutsModal.items.rejectHunk"),
        },
        {
          keys: ["E", "Enter"],
          description: i18n.t("shortcutsModal.items.enterEdit"),
        },
        {
          keys: ["Escape"],
          description: i18n.t("shortcutsModal.items.exitEdit"),
        },
        {
          keys: ["Alt + B"],
          description: i18n.t("shortcutsModal.items.threeWayBase"),
        },
        {
          keys: ["Alt + L"],
          description: i18n.t("shortcutsModal.items.threeWayLeft"),
        },
        {
          keys: ["Alt + R"],
          description: i18n.t("shortcutsModal.items.threeWayRight"),
        },
      ],
    },
    {
      title: i18n.t("shortcutsModal.sections.viewCommand"),
      shortcuts: [
        {
          keys: ["Ctrl + Shift + P"],
          description: i18n.t("shortcutsModal.items.commandPalette"),
        },
        {
          keys: ["Ctrl + N"],
          description: i18n.t("shortcutsModal.items.toggleNoise"),
        },
        {
          keys: ["Alt + F/E/M/V/G/H"],
          description: i18n.t("shortcutsModal.items.menuCategories"),
        },
        {
          keys: ["F1", "?"],
          description: i18n.t("shortcutsModal.items.showShortcuts"),
        },
      ],
    },
    {
      title: i18n.t("shortcutsModal.sections.fileSession"),
      shortcuts: [
        {
          keys: ["Ctrl + S"],
          description: i18n.t("shortcutsModal.items.save"),
        },
        {
          keys: ["F5", "Ctrl + Shift + R"],
          description: i18n.t("shortcutsModal.items.reload"),
        },
        {
          keys: ["Ctrl + O"],
          description: i18n.t("shortcutsModal.items.openFile"),
        },
        {
          keys: ["Ctrl + Shift + O"],
          description: i18n.t("shortcutsModal.items.openDir"),
        },
        {
          keys: ["Ctrl + Shift + T"],
          description: i18n.t("shortcutsModal.items.restoreSession"),
        },
        {
          keys: ["Ctrl + Q"],
          description: i18n.t("shortcutsModal.items.exitApp"),
        },
      ],
    },
  ];
}

export function ShortcutsModal({ model }: ShortcutsModalProps) {
  useModel(i18n);

  const handleClose = () => {
    model.setShortcutsModalOpen(false);
  };

  const sections = getShortcutSections();

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
            {i18n.t("shortcutsModal.title")}
          </h2>
          <button
            type="button"
            class="modal-close-button"
            onClick={handleClose}
            aria-label={i18n.t("shortcutsModal.close")}
          >
            ×
          </button>
        </div>

        <div class="modal-body shortcuts-modal-body">
          {sections.map((section) => (
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
            {i18n.t("shortcutsModal.close")} (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
