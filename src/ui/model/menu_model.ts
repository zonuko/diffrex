/**
 * MenuModel (B8-01 Smalltalk-80 MVC Active Domain Model)
 *
 * アプリケーションメニューバーの定義、開閉状態、モーダル状態、
 * およびコマンドパレットの状態を保持・通知する。
 */

import { Observable } from "./observable.ts";

export interface MenuItemDef {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  action?: () => void;
  children?: MenuItemDef[];
}

export interface MenuCategoryDef {
  id: string;
  label: string;
  accessKey?: string; // 'F', 'E', 'M', 'V', 'G', 'H' 等
  items: MenuItemDef[];
}

export class MenuModel extends Observable<MenuModel> {
  private _categories: MenuCategoryDef[] = [];
  private _activeCategoryIndex: number | null = null;
  private _isShortcutsModalOpen = false;
  private _isAboutModalOpen = false;
  private _isCommandPaletteOpen = false;
  private _isOpenSessionModalOpen = false;
  private _openSessionInitialTab: "file" | "dir" | "git" | "3way" = "file";
  private _commandPaletteQuery = "";
  private _commandPaletteSelectedIndex = 0;

  get categories(): MenuCategoryDef[] {
    return this._categories;
  }

  get activeCategoryIndex(): number | null {
    return this._activeCategoryIndex;
  }

  get isShortcutsModalOpen(): boolean {
    return this._isShortcutsModalOpen;
  }

  get isAboutModalOpen(): boolean {
    return this._isAboutModalOpen;
  }

  get isCommandPaletteOpen(): boolean {
    return this._isCommandPaletteOpen;
  }

  get isOpenSessionModalOpen(): boolean {
    return this._isOpenSessionModalOpen;
  }

  get openSessionInitialTab(): "file" | "dir" | "git" | "3way" {
    return this._openSessionInitialTab;
  }

  get commandPaletteQuery(): string {
    return this._commandPaletteQuery;
  }

  get commandPaletteSelectedIndex(): number {
    return this._commandPaletteSelectedIndex;
  }

  setCategories(categories: MenuCategoryDef[]): void {
    this._categories = categories;
    this.notify(this);
  }

  openCategory(index: number): void {
    if (this._activeCategoryIndex !== index) {
      this._activeCategoryIndex = index;
      this.notify(this);
    }
  }

  closeMenu(): void {
    if (this._activeCategoryIndex !== null) {
      this._activeCategoryIndex = null;
      this.notify(this);
    }
  }

  toggleCategory(index: number): void {
    if (this._activeCategoryIndex === index) {
      this.closeMenu();
    } else {
      this.openCategory(index);
    }
  }

  nextCategory(): void {
    if (this._categories.length === 0) return;
    if (this._activeCategoryIndex === null) {
      this._activeCategoryIndex = 0;
    } else {
      this._activeCategoryIndex = (this._activeCategoryIndex + 1) %
        this._categories.length;
    }
    this.notify(this);
  }

  prevCategory(): void {
    if (this._categories.length === 0) return;
    if (this._activeCategoryIndex === null) {
      this._activeCategoryIndex = this._categories.length - 1;
    } else {
      this._activeCategoryIndex =
        (this._activeCategoryIndex - 1 + this._categories.length) %
        this._categories.length;
    }
    this.notify(this);
  }

  setShortcutsModalOpen(open: boolean): void {
    if (this._isShortcutsModalOpen !== open) {
      this._isShortcutsModalOpen = open;
      if (open) {
        this.closeMenu();
        this._isAboutModalOpen = false;
        this._isCommandPaletteOpen = false;
        this._isOpenSessionModalOpen = false;
      }
      this.notify(this);
    }
  }

  setAboutModalOpen(open: boolean): void {
    if (this._isAboutModalOpen !== open) {
      this._isAboutModalOpen = open;
      if (open) {
        this.closeMenu();
        this._isShortcutsModalOpen = false;
        this._isCommandPaletteOpen = false;
        this._isOpenSessionModalOpen = false;
      }
      this.notify(this);
    }
  }

  setOpenSessionModalOpen(
    open: boolean,
    initialTab: "file" | "dir" | "git" | "3way" = "file",
  ): void {
    if (
      this._isOpenSessionModalOpen !== open ||
      this._openSessionInitialTab !== initialTab
    ) {
      this._isOpenSessionModalOpen = open;
      this._openSessionInitialTab = initialTab;
      if (open) {
        this.closeMenu();
        this._isShortcutsModalOpen = false;
        this._isAboutModalOpen = false;
        this._isCommandPaletteOpen = false;
      }
      this.notify(this);
    }
  }

  setCommandPaletteOpen(open: boolean): void {
    if (this._isCommandPaletteOpen !== open) {
      this._isCommandPaletteOpen = open;
      if (open) {
        this.closeMenu();
        this._isShortcutsModalOpen = false;
        this._isAboutModalOpen = false;
        this._isOpenSessionModalOpen = false;
        this._commandPaletteQuery = "";
        this._commandPaletteSelectedIndex = 0;
      }
      this.notify(this);
    }
  }

  setCommandPaletteQuery(query: string): void {
    if (this._commandPaletteQuery !== query) {
      this._commandPaletteQuery = query;
      this._commandPaletteSelectedIndex = 0;
      this.notify(this);
    }
  }

  setCommandPaletteSelectedIndex(index: number): void {
    if (this._commandPaletteSelectedIndex !== index) {
      this._commandPaletteSelectedIndex = index;
      this.notify(this);
    }
  }
}
