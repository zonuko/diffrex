/**
 * CommandPalette (B8-05 Smalltalk-80 MVC View)
 *
 * Ctrl+Shift+P で開くクイックコマンドパレット。
 * 全メニューコマンドのインクリメンタル検索・即時実行を行う。
 */

import { useEffect, useRef } from "preact/hooks";
import type { MenuModel } from "../model/menu_model.ts";
import type { MenuController } from "../controller/menu_controller.ts";
import { useModel } from "../hooks/use_model.ts";
import { i18n } from "../i18n/i18n_model.ts";

export interface CommandPaletteProps {
  model: MenuModel;
  controller: MenuController;
}

export function CommandPalette({ model, controller }: CommandPaletteProps) {
  useModel(model);
  useModel(i18n);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (model.isCommandPaletteOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [model.isCommandPaletteOpen]);

  const filteredCommands = controller.filterCommands(model.commandPaletteQuery);
  const selectedIndex = model.commandPaletteSelectedIndex;

  // 選択アイテムが表示領域に入るようにスクロール
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(
        `.command-palette-item[data-index="${selectedIndex}"]`,
      ) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const handleClose = () => {
    model.setCommandPaletteOpen(false);
  };

  const handleItemClick = (index: number) => {
    model.setCommandPaletteSelectedIndex(index);
    controller.executeSelectedCommand();
  };

  return (
    <div class="command-palette-overlay" onClick={handleClose}>
      <div
        class="command-palette-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={i18n.t("commandPalette.ariaLabel")}
      >
        <div class="command-palette-input-wrapper">
          <span class="command-palette-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            class="command-palette-input"
            placeholder={i18n.t("commandPalette.placeholder")}
            value={model.commandPaletteQuery}
            onInput={(e) =>
              model.setCommandPaletteQuery(
                (e.target as HTMLInputElement).value,
              )}
            onKeyDown={(e) => controller.handleGlobalKeyDown(e)}
          />
        </div>

        <div class="command-palette-list" ref={listRef} role="listbox">
          {filteredCommands.length === 0
            ? (
              <div class="command-palette-empty">
                {i18n.t("commandPalette.empty")}
              </div>
            )
            : (
              filteredCommands.map((cmd, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={cmd.id}
                    data-index={idx}
                    class={`command-palette-item ${
                      isSelected ? "selected" : ""
                    }`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleItemClick(idx)}
                    onMouseEnter={() =>
                      model.setCommandPaletteSelectedIndex(idx)}
                  >
                    <div class="command-palette-item-main">
                      <span class="command-palette-item-category">
                        {cmd.category}
                      </span>
                      <span class="command-palette-item-separator">›</span>
                      <span class="command-palette-item-label">
                        {cmd.label}
                      </span>
                    </div>
                    {cmd.shortcut && (
                      <kbd class="command-palette-item-shortcut">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                );
              })
            )}
        </div>

        <div class="command-palette-footer">
          <span class="command-palette-hint">
            ↑↓ で移動 / Enter で実行 / Esc でキャンセル
          </span>
        </div>
      </div>
    </div>
  );
}
