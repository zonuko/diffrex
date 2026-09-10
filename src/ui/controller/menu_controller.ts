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

export interface FlatCommandItem {
  id: string;
  category: string;
  label: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
}

export class MenuController {
  private _model: MenuModel;
  private _diffModel: DiffSessionModel;
  private _diffController: DiffController;
  private _dirModel: DirectoryDiffModel;
  private _dirController: DirectoryController;
  private _threeWayModel?: ThreeWaySessionModel;
  private _threeWayController?: ThreeWayController;

  constructor(
    model: MenuModel,
    diffModel: DiffSessionModel,
    diffController: DiffController,
    dirModel: DirectoryDiffModel,
    dirController: DirectoryController,
    threeWayModel?: ThreeWaySessionModel,
    threeWayController?: ThreeWayController,
  ) {
    this._model = model;
    this._diffModel = diffModel;
    this._diffController = diffController;
    this._dirModel = dirModel;
    this._dirController = dirController;
    this._threeWayModel = threeWayModel;
    this._threeWayController = threeWayController;

    this.rebuildMenu();
  }

  get model(): MenuModel {
    return this._model;
  }

  setThreeWay(
    threeWayModel: ThreeWaySessionModel,
    threeWayController: ThreeWayController,
  ): void {
    this._threeWayModel = threeWayModel;
    this._threeWayController = threeWayController;
    this.rebuildMenu();
  }

  /**
   * 現在のセッション状態・モデル状態からメニュー定義を再生成する。
   */
  rebuildMenu(): void {
    const is3Way = this._diffModel.session?.mode === "3way";
    const isDir = Boolean(this._dirModel.dirSession);
    const isTextDiff = Boolean(
      this._diffModel.session && !is3Way &&
        this._diffModel.session.mode !== "image" &&
        this._diffModel.session.mode !== "csv",
    );
    const hasSession = Boolean(this._diffModel.session || isDir);
    const isGit = Boolean(isDir && this._dirModel.dirSession?.isGitRepo);
    const canSave =
      (isTextDiff && !this._diffModel.session?.files.right.readOnly) ||
      (is3Way && !this._diffModel.session?.files.right.readOnly) ||
      (isDir && Boolean(this._dirModel.selectedPath));

    const history = this._dirModel.history || [];
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
          label: "履歴をすべて消去",
          action: () => {
            this._model.closeMenu();
            this._dirController.clearHistory();
          },
        },
      ]
      : [
        {
          id: "recent_empty",
          label: "(履歴はありません)",
          disabled: true,
        },
      ];

    const categories: MenuCategoryDef[] = [
      // 1. File (F)
      {
        id: "file",
        label: "ファイル",
        accessKey: "F",
        items: [
          {
            id: "file:open_file",
            label: "ファイル比較を開く...",
            shortcut: "Ctrl+O",
            action: () => {
              this._model.closeMenu();
              this._model.setOpenSessionModalOpen(true, "file");
            },
          },
          {
            id: "file:open_dir",
            label: "フォルダ比較を開く...",
            shortcut: "Ctrl+Shift+O",
            action: () => {
              this._model.closeMenu();
              this._model.setOpenSessionModalOpen(true, "dir");
            },
          },
          {
            id: "file:open_git",
            label: "単一 Git リポジトリを開く...",
            action: () => {
              this._model.closeMenu();
              this._model.setOpenSessionModalOpen(true, "git");
            },
          },
          {
            id: "file:open_3way",
            label: "3-Way マージを開く...",
            action: () => {
              this._model.closeMenu();
              this._model.setOpenSessionModalOpen(true, "3way");
            },
          },
          { id: "file:sep1", label: "", separator: true },
          {
            id: "file:recent",
            label: "最近開いたセッション",
            children: recentItems,
          },
          {
            id: "file:restore",
            label: "直前のセッションを復元",
            shortcut: "Ctrl+Shift+T",
            disabled: !this._dirModel.lastSession,
            action: () => {
              this._model.closeMenu();
              this._dirController.restoreLastSession();
            },
          },
          { id: "file:sep2", label: "", separator: true },
          {
            id: "file:save",
            label: "保存",
            shortcut: "Ctrl+S",
            disabled: !canSave,
            action: () => {
              this._model.closeMenu();
              if (isDir) {
                this._dirController.saveCurrentFile();
              } else if (is3Way && this._threeWayController) {
                this._threeWayController.save();
              } else {
                this._diffController.requestSave();
              }
            },
          },
          { id: "file:sep3", label: "", separator: true },
          {
            id: "file:welcome",
            label: "Welcome 画面を表示",
            disabled: !hasSession,
            action: () => {
              this._model.closeMenu();
              this._dirModel.setDirSession(null);
              this._diffModel.setSession(null);
            },
          },
          {
            id: "file:exit",
            label: "終了",
            shortcut: "Ctrl+Q",
            action: () => {
              this._model.closeMenu();
              this._dirController.requestExit(0);
            },
          },
        ],
      },

      // 2. Edit (E)
      {
        id: "edit",
        label: "編集",
        accessKey: "E",
        items: [
          {
            id: "edit:toggle_mode",
            label: this._diffModel.mode === "editing"
              ? "ナビゲーションモードに戻る"
              : "エディタ編集モードに入る",
            shortcut: "E / Enter",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              this._diffController.toggleEditMode();
            },
          },
          { id: "edit:sep1", label: "", separator: true },
          {
            id: "edit:undo",
            label: "元に戻す",
            shortcut: "Ctrl+Z",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              this._diffController.undo();
            },
          },
          {
            id: "edit:redo",
            label: "やり直す",
            shortcut: "Ctrl+Y",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              this._diffController.redo();
            },
          },
          { id: "edit:sep2", label: "", separator: true },
          {
            id: "edit:palette",
            label: "コマンドパレット...",
            shortcut: "Ctrl+Shift+P",
            action: () => {
              this._model.closeMenu();
              this._model.setCommandPaletteOpen(true);
            },
          },
        ],
      },

      // 3. Merge (M)
      {
        id: "merge",
        label: "マージ",
        accessKey: "M",
        items: [
          {
            id: "merge:next_hunk",
            label: "次の差分 (Hunk)",
            shortcut: "Alt+Down / J",
            disabled: !isTextDiff && !is3Way,
            action: () => {
              this._model.closeMenu();
              if (is3Way && this._threeWayController) {
                this._threeWayController.nextConflict();
              } else {
                this._diffController.nextHunk();
              }
            },
          },
          {
            id: "merge:prev_hunk",
            label: "前の差分 (Hunk)",
            shortcut: "Alt+Up / K",
            disabled: !isTextDiff && !is3Way,
            action: () => {
              this._model.closeMenu();
              if (is3Way && this._threeWayController) {
                this._threeWayController.prevConflict();
              } else {
                this._diffController.prevHunk();
              }
            },
          },
          { id: "merge:sep1", label: "", separator: true },
          {
            id: "merge:left_to_right",
            label: "左の内容を右へ適用 (マージ)",
            shortcut: "Ctrl+R",
            disabled: !isTextDiff ||
              this._diffModel.session?.files.right.readOnly,
            action: () => {
              this._model.closeMenu();
              this._diffController.mergeLeftToRight();
            },
          },
          {
            id: "merge:right_to_left",
            label: "右の内容を左へ適用 (リバート)",
            shortcut: "Ctrl+L",
            disabled: !isTextDiff ||
              this._diffModel.session?.files.left.readOnly,
            action: () => {
              this._model.closeMenu();
              this._diffController.mergeRightToLeft();
            },
          },
          { id: "merge:sep2", label: "", separator: true },
          {
            id: "merge:accept",
            label: "現在の Hunk を承認",
            shortcut: "A",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              this._diffController.acceptHunk();
            },
          },
          {
            id: "merge:reject",
            label: "現在の Hunk を拒否",
            shortcut: "R",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              this._diffController.rejectHunk();
            },
          },
          {
            id: "merge:accept_all",
            label: "すべての Hunk を一括承認",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              this._diffController.acceptAllHunks();
            },
          },
          {
            id: "merge:reject_all",
            label: "すべての Hunk を一括拒否",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              this._diffController.rejectAllHunks();
            },
          },
          ...(is3Way
            ? [
              { id: "merge:sep3", label: "", separator: true },
              {
                id: "merge:3way_base",
                label: "[3-Way] Base (共通祖先) を採用",
                shortcut: "Alt+B",
                action: () => {
                  this._model.closeMenu();
                  this._threeWayController?.resolveActiveHunk("base");
                },
              },
              {
                id: "merge:3way_left",
                label: "[3-Way] Left (Ours) を採用",
                shortcut: "Alt+L",
                action: () => {
                  this._model.closeMenu();
                  this._threeWayController?.resolveActiveHunk("local");
                },
              },
              {
                id: "merge:3way_right",
                label: "[3-Way] Right (Theirs) を採用",
                shortcut: "Alt+R",
                action: () => {
                  this._model.closeMenu();
                  this._threeWayController?.resolveActiveHunk("remote");
                },
              },
            ]
            : []),
        ],
      },

      // 4. View (V)
      {
        id: "view",
        label: "表示",
        accessKey: "V",
        items: [
          {
            id: "view:toggle_noise",
            label: "ノイズ差分（空白・コメント）を折りたたむ",
            shortcut: "Ctrl+N",
            checked: this._diffModel.noiseFolded,
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              this._diffController.toggleNoiseFolded();
            },
          },
          {
            id: "view:expand_all",
            label: "すべての折りたたみを展開",
            disabled: !isTextDiff,
            action: () => {
              this._model.closeMenu();
              this._diffController.expandAllHunks();
            },
          },
        ],
      },

      // 5. Git (G)
      {
        id: "git",
        label: "Git",
        accessKey: "G",
        items: [
          {
            id: "git:rescan",
            label: "未コミット差分を再スキャン",
            disabled: !isGit,
            action: () => {
              this._model.closeMenu();
              if (this._dirModel.dirSession?.targetDir) {
                this._dirController.startGitSession(
                  this._dirModel.dirSession.targetDir,
                  {
                    branch: this._dirModel.dirSession.git?.branch,
                    readOnly: this._dirModel.dirSession.readOnly,
                  },
                );
              }
            },
          },
          {
            id: "git:worktrees",
            label: "Worktree 一覧を表示...",
            disabled: !isGit,
            action: () => {
              this._model.closeMenu();
              if (this._dirModel.dirSession?.targetDir) {
                this._dirController.sendMessage({
                  type: "git:list_worktrees",
                  repoPath: this._dirModel.dirSession.targetDir,
                });
              }
            },
          },
        ],
      },

      // 6. Help (H)
      {
        id: "help",
        label: "ヘルプ",
        accessKey: "H",
        items: [
          {
            id: "help:shortcuts",
            label: "キーボードショートカット一覧",
            shortcut: "F1 / ?",
            action: () => {
              this._model.closeMenu();
              this._model.setShortcutsModalOpen(true);
            },
          },
          { id: "help:sep1", label: "", separator: true },
          {
            id: "help:about",
            label: "Diffrex について (About)",
            action: () => {
              this._model.closeMenu();
              this._model.setAboutModalOpen(true);
            },
          },
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
   */
  filterCommands(query: string): FlatCommandItem[] {
    const all = this.getFlatCommandList();
    if (!query.trim()) {
      return all.filter((c) => !c.disabled);
    }
    const q = query.toLowerCase().trim();
    return all.filter((c) => {
      if (c.disabled) return false;
      return (
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.shortcut && c.shortcut.toLowerCase().includes(q))
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
