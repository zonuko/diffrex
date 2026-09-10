/**
 * MenuItem (B8-02 Smalltalk-80 MVC View)
 *
 * メニューバーの個別ドロップダウン項目およびサブメニューの描画。
 */

import { useState } from "preact/hooks";
import type { MenuItemDef } from "../model/menu_model.ts";

export interface MenuItemProps {
  item: MenuItemDef;
  onItemClick?: () => void;
}

export function MenuItem({ item, onItemClick }: MenuItemProps) {
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);

  if (item.separator) {
    return <div class="menu-separator" role="separator" />;
  }

  const hasChildren = Boolean(item.children && item.children.length > 0);

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (item.disabled) return;

    if (hasChildren) {
      setIsSubmenuOpen(!isSubmenuOpen);
      return;
    }

    if (item.action) {
      item.action();
      if (onItemClick) {
        onItemClick();
      }
    }
  };

  return (
    <div
      class={`menu-item ${item.disabled ? "disabled" : ""} ${
        hasChildren ? "has-children" : ""
      }`}
      role="menuitem"
      aria-disabled={item.disabled}
      onClick={handleClick}
      onMouseEnter={() => hasChildren && setIsSubmenuOpen(true)}
      onMouseLeave={() => hasChildren && setIsSubmenuOpen(false)}
    >
      <span class="menu-item-check">
        {item.checked ? "✓" : ""}
      </span>
      <span class="menu-item-label">{item.label}</span>
      {item.shortcut && <span class="menu-item-shortcut">{item.shortcut}</span>}
      {hasChildren && <span class="menu-item-arrow">▶</span>}

      {hasChildren && isSubmenuOpen && (
        <div class="menu-submenu" role="menu">
          {item.children!.map((child) => (
            <MenuItem
              key={child.id}
              item={child}
              onItemClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
