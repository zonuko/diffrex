/**
 * TabModel (B11-01 Smalltalk-80 MVC Active Domain Model)
 *
 * マルチタブセッション管理のドメインモデル。
 * 複数の比較セッション（2-Way, 3-Way, Directory, Image, CSV, Welcome）をタブ単位で保持・管理し、
 * アクティブタブの切り替え、Dirty（未保存）フラグの集約、Observer 通知を行う。
 */

import { Observable } from "./observable.ts";
import type { DiffSessionModel } from "./diff_session_model.ts";
import type { DirectoryDiffModel } from "./dir_diff_model.ts";
import type { ThreeWaySessionModel } from "./three_way_session_model.ts";
import type { DiffController } from "../controller/diff_controller.ts";
import type { DirectoryController } from "../controller/dir_controller.ts";
import type { ThreeWayController } from "../controller/three_way_controller.ts";

export type TabSessionType =
  | "2way"
  | "3way"
  | "directory"
  | "image"
  | "csv"
  | "welcome";

export interface TabItem {
  id: string;
  title: string;
  sessionType: TabSessionType;
  diffModel?: DiffSessionModel;
  diffController?: DiffController;
  dirModel?: DirectoryDiffModel;
  dirController?: DirectoryController;
  threeWayModel?: ThreeWaySessionModel;
  threeWayController?: ThreeWayController;
  relativePath?: string;
  isDirty: boolean;
  closable: boolean;
}

export class TabContainerModel extends Observable<TabContainerModel> {
  private _tabs: TabItem[] = [];
  private _activeTabId: string | null = null;
  private _pendingCloseTabId: string | null = null;

  constructor(initialTabs: TabItem[] = []) {
    super();
    this._tabs = [...initialTabs];
    if (this._tabs.length > 0) {
      this._activeTabId = this._tabs[0].id;
    }
  }

  // --- ゲッター ---

  get tabs(): readonly TabItem[] {
    return this._tabs;
  }

  get activeTabId(): string | null {
    return this._activeTabId;
  }

  get activeTab(): TabItem | null {
    if (!this._activeTabId) return null;
    return this._tabs.find((t) => t.id === this._activeTabId) ?? null;
  }

  get activeTabIndex(): number {
    if (!this._activeTabId) return -1;
    return this._tabs.findIndex((t) => t.id === this._activeTabId);
  }

  get hasDirtyTabs(): boolean {
    return this._tabs.some((t) => t.isDirty);
  }

  get pendingCloseTabId(): string | null {
    return this._pendingCloseTabId;
  }

  get pendingCloseTab(): TabItem | null {
    if (!this._pendingCloseTabId) return null;
    return this._tabs.find((t) => t.id === this._pendingCloseTabId) ?? null;
  }

  // --- タブ操作ミューテーション ---

  /**
   * 新規タブを追加する。
   * @param tab 追加するタブ
   * @param makeActive 追加したタブをアクティブにするか（デフォルト: true）
   */
  addTab(tab: TabItem, makeActive = true): void {
    // 既存の同IDタブがあれば上書き更新
    const existingIndex = this._tabs.findIndex((t) => t.id === tab.id);
    if (existingIndex !== -1) {
      this._tabs[existingIndex] = tab;
      if (makeActive) {
        this._activeTabId = tab.id;
      }
      this.notify(this);
      return;
    }

    this._tabs.push(tab);
    if (makeActive || this._activeTabId === null) {
      this._activeTabId = tab.id;
    }
    this.notify(this);
  }

  /**
   * 指定した ID のタブを削除する。
   * 削除されたタブがアクティブだった場合、隣接するタブを自動的にアクティブにする。
   */
  removeTab(id: string): TabItem | null {
    const index = this._tabs.findIndex((t) => t.id === id);
    if (index === -1) return null;

    const [removed] = this._tabs.splice(index, 1);

    if (this._activeTabId === id) {
      if (this._tabs.length === 0) {
        this._activeTabId = null;
      } else {
        const nextIndex = Math.min(index, this._tabs.length - 1);
        this._activeTabId = this._tabs[nextIndex].id;
      }
    }

    if (this._pendingCloseTabId === id) {
      this._pendingCloseTabId = null;
    }

    this.notify(this);
    return removed;
  }

  /**
   * 指定した ID のタブをアクティブにする。
   */
  setActiveTab(id: string): void {
    if (this._activeTabId === id) return;
    const exists = this._tabs.some((t) => t.id === id);
    if (exists) {
      this._activeTabId = id;
      this.notify(this);
    }
  }

  /**
   * 次のタブへ切り替える（ラップアラウンド対応）。
   */
  nextTab(): void {
    if (this._tabs.length <= 1) return;
    const currentIndex = this.activeTabIndex;
    const nextIndex = (currentIndex + 1) % this._tabs.length;
    this._activeTabId = this._tabs[nextIndex].id;
    this.notify(this);
  }

  /**
   * 前のタブへ切り替える（ラップアラウンド対応）。
   */
  prevTab(): void {
    if (this._tabs.length <= 1) return;
    const currentIndex = this.activeTabIndex;
    const prevIndex = (currentIndex - 1 + this._tabs.length) %
      this._tabs.length;
    this._activeTabId = this._tabs[prevIndex].id;
    this.notify(this);
  }

  /**
   * インデックス指定でタブを切り替える（0-indexed）。
   */
  switchToIndex(index: number): void {
    if (index >= 0 && index < this._tabs.length) {
      this._activeTabId = this._tabs[index].id;
      this.notify(this);
    }
  }

  /**
   * タブの並び順を変更する（ドラッグ＆ドロップ用）。
   */
  moveTab(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= this._tabs.length ||
      toIndex < 0 ||
      toIndex >= this._tabs.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const [moved] = this._tabs.splice(fromIndex, 1);
    this._tabs.splice(toIndex, 0, moved);
    this.notify(this);
  }

  /**
   * 指定したタブの Dirty（未保存）状態を更新する。
   */
  updateTabDirty(id: string, isDirty: boolean): void {
    const tab = this._tabs.find((t) => t.id === id);
    if (tab && tab.isDirty !== isDirty) {
      tab.isDirty = isDirty;
      this.notify(this);
    }
  }

  /**
   * 指定したタブのタイトルを更新する。
   */
  updateTabTitle(id: string, title: string): void {
    const tab = this._tabs.find((t) => t.id === id);
    if (tab && tab.title !== title) {
      tab.title = title;
      this.notify(this);
    }
  }

  /**
   * 未保存チェック確認中のタブ ID を設定する。
   */
  setPendingCloseTabId(id: string | null): void {
    if (this._pendingCloseTabId !== id) {
      this._pendingCloseTabId = id;
      this.notify(this);
    }
  }

  /**
   * ID でタブを検索する。
   */
  findTabById(id: string): TabItem | undefined {
    return this._tabs.find((t) => t.id === id);
  }

  /**
   * 相対パスでタブを検索する（ディレクトリ比較内のファイル重複オープン防止用）。
   */
  findTabByPath(relativePath: string): TabItem | undefined {
    return this._tabs.find((t) => t.relativePath === relativePath);
  }

  /**
   * 全てのタブをクリアする。
   */
  override clear(): void {
    this._tabs = [];
    this._activeTabId = null;
    this._pendingCloseTabId = null;
    this.notify(this);
  }
}
