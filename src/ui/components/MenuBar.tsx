/**
 * MenuBar (B8-02 Smalltalk-80 MVC View)
 *
 * アプリケーションの最上部に配置されるトップメニューバー。
 * 各カテゴリ（ファイル、編集、マージ、表示、Git、ヘルプ）とドロップダウンを描画する。
 */

import { useEffect, useRef } from "preact/hooks";
import type { MenuModel } from "../model/menu_model.ts";
import type { MenuController } from "../controller/menu_controller.ts";
import { MenuItem } from "./MenuItem.tsx";
import { useModel } from "../hooks/use_model.ts";

export interface MenuBarProps {
  model: MenuModel;
  controller: MenuController;
}

export function MenuBar({ model, controller }: MenuBarProps) {
  useModel(model);
  const barRef = useRef<HTMLDivElement>(null);

  // メニューバーの外側をクリックしたときにメニューを閉じる
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (model.activeCategoryIndex !== null && barRef.current) {
        if (!barRef.current.contains(e.target as Node)) {
          model.closeMenu();
        }
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [model, model.activeCategoryIndex]);

  const activeIndex = model.activeCategoryIndex;

  const handleCategoryClick = (index: number) => {
    controller.rebuildMenu();
    model.toggleCategory(index);
  };

  const handleCategoryMouseEnter = (index: number) => {
    // 既にいずれかのメニューが開いている状態であれば、ホバーで他カテゴリへ切り替える
    if (activeIndex !== null && activeIndex !== index) {
      controller.rebuildMenu();
      model.openCategory(index);
    }
  };

  return (
    <header class="app-menu-bar" ref={barRef} role="menubar">
      <div class="menu-bar-brand">
        <span class="menu-bar-logo">DIFFREX</span>
      </div>

      <nav class="menu-bar-items">
        {model.categories.map((category, idx) => {
          const isOpen = activeIndex === idx;
          return (
            <div
              key={category.id}
              class={`menu-category-container ${isOpen ? "open" : ""}`}
            >
              <button
                type="button"
                class={`menu-category-button ${isOpen ? "active" : ""}`}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={isOpen}
                onClick={() => handleCategoryClick(idx)}
                onMouseEnter={() => handleCategoryMouseEnter(idx)}
              >
                <span class="menu-category-label">{category.label}</span>
                {category.accessKey && (
                  <span class="menu-category-accesskey">
                    ({category.accessKey})
                  </span>
                )}
              </button>

              {isOpen && (
                <div class="menu-dropdown" role="menu">
                  {category.items.map((item) => (
                    <MenuItem
                      key={item.id}
                      item={item}
                      onItemClick={() => model.closeMenu()}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </header>
  );
}
