/**
 * MenuController (B8-01 Smalltalk-80 MVC Controller)
 *
 * ユーザー入力（マウス、キーボード、コマンドパレット）を解釈し、
 * MenuModel の更新および各種サブコントローラへのコマンドディスパッチを行う。
 */

import type {
  MenuCategoryDef,
  MenuItemDef,
  MenuModel,
} from "../model/menu_model.ts";
import type { DiffSessionModel } from "../model/diff_session_model.ts";
import type { DiffController } from "./diff_controller.ts";
import type { DirectoryDiffModel } from "../model/dir_diff_model.ts";
import type { DirectoryController } from "./dir_controller.ts";
import type { ThreeWaySessionModel } from "../model/three_way_session_model.ts";
import type { ThreeWayController } from "./three_way_controller.ts";
import type { TabController } from "./tab_controller.ts";
import { i18n } from "../i18n/i18n_model.ts";
import { ja } from "../i18n/locales/ja.ts";
import { en } from "../i18n/locales/en.ts";
import type { TranslationKey } from "../i18n/types.ts";

export interface FlatCommandItem {
  id: string;
  category: string;
  label: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  searchAliases?: string[];
}

export class MenuController {
  private _model: MenuModel;
  private _diffModel: DiffSessionModel;
  private _diffController: DiffController;
  private _dirModel: DirectoryDiffModel;
  private _dirController: DirectoryController;
  private _threeWayModel?: ThreeWaySessionModel;
  private _threeWayController?: ThreeWayController;
  private _tabController?: TabController;

  constructor(
    model: MenuModel,
    diffModel: DiffSessionModel,
    diffController: DiffController,
    dirModel: DirectoryDiffModel,
    dirController: DirectoryController,
    threeWayModel?: ThreeWaySessionModel,
    threeWayController?: ThreeWayController,
    tabController?: TabController,
  ) {
    this._model = model;
    this._diffModel = diffModel;
    this._diffController = diffController;
    this._dirModel = dirModel;
    this._dirController = dirController;
    this._threeWayModel = threeWayModel;
    this._threeWayController = threeWayController;
    this._tabController = tabController;

    // 言語切り替え時に自動でメニューを再構築する
    i18n.subscribe(() => {
      this.rebuildMenu();
    });

    this.rebuildMenu();
  }

  get model(): MenuModel {
    return this._model;
  }

  setTabController(tabController: TabController): void {
    if (this._tabController === tabController) return;
    this._tabController = tabController;
    this.rebuildMenu();
  }

  setThreeWay(
    threeWayModel: ThreeWaySessionModel,
    threeWayController: ThreeWayController,
  ): void {
    if (
      this._threeWayModel === threeWayModel &&
      this._threeWayController === threeWayController
    ) {
      return;
    }
    this._threeWayModel = threeWayModel;
    this._threeWayController = threeWayController;
    this.rebuildMenu();
  }

  /**
   * 現在のセッション状態・モデル状態からメニュー定義を再生成する。
   */
  rebuildMenu(): void {
    const activeTab = this._tabController?.model.activeTab;

    const is3Way = activeTab
      ? activeTab.sessionType === "3way"
      : this._diffModel.session?.mode === "3way";

    const isDir = activeTab
      ? activeTab.sessionType === "directory"
      : Boolean(this._dirModel.dirSession);

    const activeDiffModel = activeTab?.diffModel ?? this._diffModel;
    const activeDiffController = activeTab?.diffController ??
      this._diffController;
    const activeThreeWayModel = activeTab?.threeWayModel ?? this._threeWayModel;
    const activeThreeWayController = activeTab?.threeWayController ??
      this._threeWayController;
    const activeDirModel = activeTab?.dirModel ?? this._dirModel;
    const activeDirController = activeTab?.dirController ??
      this._dirController;

    const currentSession = is3Way
      ? (activeThreeWayModel?.session ?? activeDiffModel.session)
      : activeDiffModel.session;

    const isTextDiff = Boolean(
      currentSession && !is3Way &&
        currentSession.mode !== "image" &&
        currentSession.mode !== "csv",
    );
    const hasSession = Boolean(
      currentSession || (isDir && activeDirModel.dirSession),
    );
    const isGit = Boolean(
      isDir &&
        (activeDirModel.dirSession?.isGitRepo ||
          activeDirModel.dirSession?.git?.isGitRepo),
    );
    const canSave = (isTextDiff && !currentSession?.files.right.readOnly) ||
      (is3Way && !currentSession?.files.right.readOnly) ||
      (isDir && Boolean(activeDirModel.selectedPath));

    const history = activeDirModel.history || [];
    const recentItems: MenuItemDef[] = history.length > 0
      ? [
        ...history.slice(0, 10).map((h, i) => ({
          id: `recent_${i}_${h.id}`,
          label: h.mode === "directory"
            ? `📁 ${h.leftPath} ⇄ ${h.rightPath}`
            : h.mode === "3way"
            ? `💥 ${h.leftPath} (3-Way)`
            : `📄 ${h.leftPath} ⇄ ${h.rightPath}`,
          action: () => {
            this._model.closeMenu();
            this.openHistoryEntry(h);
          },
        })),
        { id: "sep_recent", label: "", separator: true },
        {
          id: "recent_clear",
          label: i18n.t("menu.items.clearHistory"),
          searchAliases: [
            i18n.locale === "ja"
              ? en.menu.items.clearHistory
              : ja.menu.items.clearHistory,
          ],
          action: () => {
            this._model.closeMenu();
            activeDirController.clearHistory();
          },
        },
      ]
      : [
        {
          id: "recent_empty",
          label: i18n.t("menu.items.noHistory"),
          disabled: true,
        },
      ];

    const mi = (
      id: string,
      key: keyof typeof ja.menu.items,
      opts?: Partial<MenuItemDef>,
    ): MenuItemDef => {
      const label = i18n.t(`menu.items.${key}` as TranslationKey);
      const other = i18n.locale === "ja"
        ? en.menu.items[key]
        : ja.menu.items[key];
      return {
        id,
        label,
        searchAliases: other ? [other] : undefined,
        ...opts,
      };
    };

    const categories: MenuCategoryDef[] = [
      // 1. File (F)
      {
        id: "file",
        label: i18n.t("menu.categories.file.label"),
        accessKey: i18n.t("menu.categories.file.accessKey"),
        items: [
          mi("file:open_file", "openFile", {
            shortcut: "Ctrl+O",
            action: () => {
              this._model.closeMenu();
              this._model.setOpenSessionModalOpen(true, "file");
            },
          }),
          mi("file:open_dir", "openDir", {
            shortcut: "Ctrl+Shift+O",
            action: () => {
              this._model.closeMenu();
              this._model.setOpenSessionModalOpen(true, "dir");
            },
          }),
          mi("file:open_git", "openGit", {
            action: () => {
              this._model.closeMenu();
              this._model.setOpenSessionModalOpen(true, "git");
            },
          }),
          mi("file:open_3way", "open3Way", {
            action: () => {
              this._model.closeMenu();
              this._model.setOpenSessionModalOpen(true, "3way");
            },
          }),
          { id: "file:sep1", label: "", separator: true },
          mi("file:recent", "recentSessions", {
            children: recentItems,
          }),
          mi("file:restore", "restoreSession", {
            shortcut: "Ctrl+Shift+T",
            disabled: !activeDirModel.workspaceState?.tabs.length &&
              !activeDirModel.lastSession,
            action: () => {
              this._model.closeMenu();
              if (activeDirModel.workspaceState?.tabs.length) {
                activeDirController.restoreWorkspace();
              } else {
                activeDirController.restoreLastSession();
              }
            },
          }),
          mi("file:restore_on_startup", "restoreOnStartup", {
            checked: activeDirModel.workspaceState?.restoreOnStartup !== false,
            action: () => {
              const current =
                activeDirModel.workspaceState?.restoreOnStartup !== false;
              activeDirController.setRestoreOnStartup(!current);
            },
          }),
          { id: "file:sep2", label: "", separator: true },
          mi("file:save", "save", {
            shortcut: "Ctrl+S",
            disabled: !canSave,
            action: () => {
              this._model.closeMenu();
              if (isDir) {
                activeDirController.saveCurrentFile();
              } else if (is3Way && activeThreeWayController) {
                activeThreeWayController.save();
              } else {
                activeDiffController.requestSave();
              }
            },
          }),
          mi("file:reload", "reload", {
            shortcut: "F5 / Ctrl+Shift+R",
            disabled: !hasSession,
            action: () => {
              this._model.closeMenu();
              this.reloadCurrent();
            },
          }),
          mi("file:close_tab", "closeTab", {
            shortcut: "Ctrl+W",
            disabled: !this._tabController ||
              (this._tabController.model.tabs.length <= 1 &&
                !this._tabController.model.activeTab?.closable),
            action: () => {
              this._model.closeMenu();
              this._tabController?.closeCurrentTab();
            },
          }),
          { id: "file:sep3", label: "", separator: true },
          mi("file:welcome", "showWelcome", {
            disabled: !hasSession,
            action: () => {
              this._model.closeMenu();
              this._dirModel.setDirSession(null);
              this._diffModel.setSession(null);
              if (activeTab?.dirModel) activeTab.dirModel.setDirSession(null);
              if (activeTab?.diffModel) activeTab.diffModel.setSession(null);
            },
          }),
          mi("file:exit", "exit", {
            shortcut: "Ctrl+Q",
            action: () => {
              this._model.closeMenu();
              activeDirController.requestExit(0);
            },
          }),
        ],
      },

      // 2. Edit (E)
      {
        id: "edit",
        label: i18n.t("menu.categories.edit.label"),
        accessKey: i18n.t("menu.categories.edit.accessKey"),
        items: [
          {
            id: "edit:toggle_mode",
            label: activeDiffModel.mode === "editing"
              ? i18n.t("menu.items.backToNav")
              : i18n.t("menu.items.enterEdit"),
            shortcut: "E / Enter",
            disabled: !isTextDiff,
            searchAliases: [
              activeDiffModel.mode === "editing"
                ? (i18n.locale === "ja"
                  ? en.menu.items.backToNav
                  : ja.menu.items.backToNav)
                : (i18n.locale === "ja"
                  ? en.menu.items.enterEdit
                  : ja.menu.items.enterEdit),
            ],
            action: () => {
              this._model.closeMenu();
              activeDiffController.toggleEditMode();
            },
          },
          { id: "edit:sep1", label: "", separator: true },
          mi("edit:undo", "undo", {
            shortcut: "Ctrl+Z",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              activeDiffController.undo();
            },
          }),
          mi("edit:redo", "redo", {
            shortcut: "Ctrl+Y",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              activeDiffController.redo();
            },
          }),
          { id: "edit:sep2", label: "", separator: true },
          mi("edit:palette", "commandPalette", {
            shortcut: "Ctrl+Shift+P",
            action: () => {
              this._model.closeMenu();
              this._model.setCommandPaletteOpen(true);
            },
          }),
        ],
      },

      // 3. Merge (M)
      {
        id: "merge",
        label: i18n.t("menu.categories.merge.label"),
        accessKey: i18n.t("menu.categories.merge.accessKey"),
        items: [
          mi("merge:next_hunk", "nextHunk", {
            shortcut: "Alt+Down / J",
            disabled: !isTextDiff && !is3Way,
            action: () => {
              this._model.closeMenu();
              if (is3Way && activeThreeWayController) {
                activeThreeWayController.nextConflict();
              } else {
                activeDiffController.nextHunk();
              }
            },
          }),
          mi("merge:prev_hunk", "prevHunk", {
            shortcut: "Alt+Up / K",
            disabled: !isTextDiff && !is3Way,
            action: () => {
              this._model.closeMenu();
              if (is3Way && activeThreeWayController) {
                activeThreeWayController.prevConflict();
              } else {
                activeDiffController.prevHunk();
              }
            },
          }),
          { id: "merge:sep1", label: "", separator: true },
          mi("merge:left_to_right", "mergeLeftToRight", {
            shortcut: "Ctrl+R",
            disabled: !isTextDiff ||
              currentSession?.files.right.readOnly,
            action: () => {
              this._model.closeMenu();
              activeDiffController.mergeLeftToRight();
            },
          }),
          mi("merge:right_to_left", "mergeRightToLeft", {
            shortcut: "Ctrl+L",
            disabled: !isTextDiff ||
              currentSession?.files.left.readOnly,
            action: () => {
              this._model.closeMenu();
              activeDiffController.mergeRightToLeft();
            },
          }),
          { id: "merge:sep2", label: "", separator: true },
          mi("merge:accept", "acceptHunk", {
            shortcut: "A",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              activeDiffController.acceptHunk();
            },
          }),
          mi("merge:reject", "rejectHunk", {
            shortcut: "R",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              activeDiffController.rejectHunk();
            },
          }),
          mi("merge:accept_all", "acceptAllHunks", {
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              activeDiffController.acceptAllHunks();
            },
          }),
          mi("merge:reject_all", "rejectAllHunks", {
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              activeDiffController.rejectAllHunks();
            },
          }),
          ...(is3Way
            ? [
              { id: "merge:sep3", label: "", separator: true },
              mi("merge:3way_base", "threeWayBase", {
                shortcut: "Alt+B",
                action: () => {
                  this._model.closeMenu();
                  activeThreeWayController?.resolveActiveHunk("base");
                },
              }),
              mi("merge:3way_left", "threeWayLeft", {
                shortcut: "Alt+L",
                action: () => {
                  this._model.closeMenu();
                  activeThreeWayController?.resolveActiveHunk("local");
                },
              }),
              mi("merge:3way_right", "threeWayRight", {
                shortcut: "Alt+R",
                action: () => {
                  this._model.closeMenu();
                  activeThreeWayController?.resolveActiveHunk("remote");
                },
              }),
            ]
            : []),
        ],
      },

      // 4. View (V)
      {
        id: "view",
        label: i18n.t("menu.categories.view.label"),
        accessKey: i18n.t("menu.categories.view.accessKey"),
        items: [
          mi("view:toggle_noise", "toggleNoise", {
            shortcut: "Ctrl+N",
            checked: activeDiffModel.noiseFolded,
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              activeDiffController.toggleNoiseFolded();
            },
          }),
          mi("view:expand_all", "expandAll", {
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              activeDiffController.expandAllHunks();
            },
          }),
          { id: "view:sep_tabs", label: "", separator: true },
          mi("view:next_tab", "nextTab", {
            shortcut: "Ctrl+Tab",
            disabled: !this._tabController ||
              this._tabController.model.tabs.length <= 1,
            action: () => {
              this._model.closeMenu();
              this._tabController?.nextTab();
            },
          }),
          mi("view:prev_tab", "prevTab", {
            shortcut: "Ctrl+Shift+Tab",
            disabled: !this._tabController ||
              this._tabController.model.tabs.length <= 1,
            action: () => {
              this._model.closeMenu();
              this._tabController?.prevTab();
            },
          }),
          { id: "view:sep_conf", label: "", separator: true },
          mi("view:confidence_thresholds", "confidenceSettings", {
            action: () => {
              this._model.closeMenu();
              this._model.setConfidenceSettingsModalOpen(true);
            },
          }),
          { id: "view:sep_lang", label: "", separator: true },
          {
            id: "view:language",
            label: i18n.t("menu.items.language"),
            children: [
              {
                id: "view:lang_ja",
                label: i18n.t("menu.items.languageJa"),
                checked: i18n.locale === "ja",
                action: () => {
                  this._model.closeMenu();
                  i18n.setLocale("ja");
                },
              },
              {
                id: "view:lang_en",
                label: i18n.t("menu.items.languageEn"),
                checked: i18n.locale === "en",
                action: () => {
                  this._model.closeMenu();
                  i18n.setLocale("en");
                },
              },
            ],
          },
        ],
      },

      // 5. Git (G)
      {
        id: "git",
        label: i18n.t("menu.categories.git.label"),
        accessKey: i18n.t("menu.categories.git.accessKey"),
        items: [
          mi("git:rescan", "rescanGit", {
            disabled: !isGit,
            action: () => {
              this._model.closeMenu();
              if (activeDirModel.dirSession?.targetDir) {
                activeDirController.startGitSession(
                  activeDirModel.dirSession.targetDir,
                  {
                    branch: activeDirModel.dirSession.git?.branch,
                    readOnly: activeDirModel.dirSession.readOnly,
                  },
                );
              }
            },
          }),
          mi("git:worktrees", "worktreeList", {
            disabled: !isGit,
            action: () => {
              this._model.closeMenu();
              if (activeDirModel.dirSession?.targetDir) {
                activeDirController.sendMessage({
                  type: "git:list_worktrees",
                  repoPath: activeDirModel.dirSession.targetDir,
                });
              }
            },
          }),
        ],
      },

      // 6. Help (H)
      {
        id: "help",
        label: i18n.t("menu.categories.help.label"),
        accessKey: i18n.t("menu.categories.help.accessKey"),
        items: [
          mi("help:shortcuts", "shortcuts", {
            shortcut: "F1 / ?",
            action: () => {
              this._model.closeMenu();
              this._model.setShortcutsModalOpen(true);
            },
          }),
          { id: "help:sep1", label: "", separator: true },
          mi("help:about", "about", {
            action: () => {
              this._model.closeMenu();
              this._model.setAboutModalOpen(true);
            },
          }),
        ],
      },
    ];

    this._model.setCategories(categories);
  }

  /**
   * 履歴エントリを開く。
   */
  openHistoryEntry(entry: import("../../core/types.ts").HistoryEntry): void {
    if (entry.mode === "directory") {
      this._dirController.startDirectorySession(
        entry.leftPath,
        entry.rightPath,
      );
    } else {
      this._dirController.startFileSession(
        entry.leftPath,
        entry.rightPath,
      );
    }
  }

  /**
   * 最新の状態に再読み込み（B16-04）。
   */
  reloadCurrent(): void {
    this._dirController.reloadSession();
  }

  /**
   * コマンドパレット用: メニュー構造から全実行可能コマンドを抽出する。
   */
  getFlatCommandList(): FlatCommandItem[] {
    const list: FlatCommandItem[] = [];

    const traverse = (categoryLabel: string, items: MenuItemDef[]) => {
      for (const item of items) {
        if (item.separator) continue;
        if (item.children && item.children.length > 0) {
          traverse(`${categoryLabel} > ${item.label}`, item.children);
        } else if (item.action) {
          list.push({
            id: item.id,
            category: categoryLabel,
            label: item.label,
            shortcut: item.shortcut,
            action: item.action,
            disabled: item.disabled,
            searchAliases: item.searchAliases,
          });
        }
      }
    };

    for (const cat of this._model.categories) {
      traverse(cat.label, cat.items);
    }

    return list;
  }

  /**
   * コマンドパレットの絞り込み検索。
   *
   * 現在のロケールのラベル・カテゴリ・ショートカットだけでなく、
   * searchAliases（もう一方の言語の文言）も検索対象とするため、
   * 日英どちらの言語で入力しても該当コマンドがヒットする。
   */
  filterCommands(query: string): FlatCommandItem[] {
    const all = this.getFlatCommandList();
    if (!query.trim()) {
      return all.filter((c) => !c.disabled);
    }
    const q = query.toLowerCase().trim();
    return all.filter((c) => {
      if (c.disabled) return false;
      const matchesAlias = c.searchAliases &&
        c.searchAliases.some((alias) => alias.toLowerCase().includes(q));
      return (
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.shortcut && c.shortcut.toLowerCase().includes(q)) ||
        Boolean(matchesAlias)
      );
    });
  }

  /**
   * コマンドパレットで現在選択されている項目を実行する。
   */
  executeSelectedCommand(): void {
    const filtered = this.filterCommands(this._model.commandPaletteQuery);
    const selected = filtered[this._model.commandPaletteSelectedIndex];
    if (selected && selected.action) {
      this._model.setCommandPaletteOpen(false);
      selected.action();
    }
  }

  /**
   * グローバルキーイベントのハンドリング（Alt アクセスキー、パレット、ショートカット）。
   */
  handleGlobalKeyDown(e: KeyboardEvent): boolean {
    const isCtrl = e.ctrlKey || e.metaKey;

    // F5 または Ctrl+Shift+R による再読み込み (B16-04)
    if (
      e.key === "F5" ||
      (isCtrl && e.shiftKey && !e.altKey && (e.key === "r" || e.key === "R"))
    ) {
      e.preventDefault();
      this.reloadCurrent();
      return true;
    }

    // 0. タブ操作ショートカット（Ctrl+W, Ctrl+Tab, Ctrl+1..9）
    if (
      !this._model.isCommandPaletteOpen &&
      !this._model.isShortcutsModalOpen &&
      !this._model.isAboutModalOpen &&
      !this._model.isOpenSessionModalOpen &&
      this._tabController?.handleKeyDown(e)
    ) {
      return true;
    }

    // 1. コマンドパレット表示中のキー操作
    if (this._model.isCommandPaletteOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        this._model.setCommandPaletteOpen(false);
        return true;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const count =
          this.filterCommands(this._model.commandPaletteQuery).length;
        if (count > 0) {
          this._model.setCommandPaletteSelectedIndex(
            (this._model.commandPaletteSelectedIndex + 1) % count,
          );
        }
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const count =
          this.filterCommands(this._model.commandPaletteQuery).length;
        if (count > 0) {
          this._model.setCommandPaletteSelectedIndex(
            (this._model.commandPaletteSelectedIndex - 1 + count) % count,
          );
        }
        return true;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        this.executeSelectedCommand();
        return true;
      }
      return false;
    }

    // 2. モーダルが開いている場合の Escape
    if (
      this._model.isShortcutsModalOpen ||
      this._model.isAboutModalOpen ||
      this._model.isOpenSessionModalOpen
    ) {
      if (e.key === "Escape") {
        e.preventDefault();
        this._model.setShortcutsModalOpen(false);
        this._model.setAboutModalOpen(false);
        this._model.setOpenSessionModalOpen(false);
        return true;
      }
      return false;
    }

    // 3. Ctrl+Shift+P でコマンドパレット起動
    if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      (e.key === "P" || e.key === "p")
    ) {
      e.preventDefault();
      this.rebuildMenu();
      this._model.setCommandPaletteOpen(true);
      return true;
    }

    // 4. F1 または ? でショートカット一覧
    if (e.key === "F1" || (e.key === "?" && !e.ctrlKey && !e.altKey)) {
      // エディタ入力中でなければ開く
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        this._model.setShortcutsModalOpen(true);
        return true;
      }
    }

    // 5. Alt+F / Alt+E / Alt+M / Alt+V / Alt+G / Alt+H で各メニューを開く
    if (e.altKey && !e.ctrlKey && !e.shiftKey) {
      const key = e.key.toUpperCase();
      const index = this._model.categories.findIndex(
        (c) => c.accessKey === key,
      );
      if (index !== -1) {
        e.preventDefault();
        this.rebuildMenu();
        this._model.toggleCategory(index);
        return true;
      }
    }

    // 6. メニューが開いている状態での矢印キーナビゲーション
    if (this._model.activeCategoryIndex !== null) {
      if (e.key === "Escape") {
        e.preventDefault();
        this._model.closeMenu();
        return true;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        this._model.prevCategory();
        return true;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        this._model.nextCategory();
        return true;
      }
    }

    return false;
  }
}
