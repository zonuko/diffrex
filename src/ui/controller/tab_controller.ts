/**
 * TabController (B11-02 Smalltalk-80 MVC Controller)
 *
 * ユーザー入力（タブクリック、閉じる、キーボード操作、DnD並び替え）を解釈し、
 * TabContainerModel を操作するとともに、未保存変更の確認フロー（保存・破棄・キャンセル）を調停する。
 */

import type {
  TabContainerModel,
  TabItem,
  TabSessionType,
} from "../model/tab_model.ts";
import type {
  DiffSessionData,
  DirectoryDiffSessionData,
  TabStateSnapshot,
  WorkspaceState,
} from "../../core/types.ts";
import { DiffSessionModel } from "../model/diff_session_model.ts";
import { DiffController } from "./diff_controller.ts";
import { ThreeWaySessionModel } from "../model/three_way_session_model.ts";
import { ThreeWayController } from "./three_way_controller.ts";
import type { DirectoryDiffModel } from "../model/dir_diff_model.ts";
import type { DirectoryController } from "./dir_controller.ts";
import type { UiToBackendMessage } from "../../desktop/ipc.ts";

export interface TabControllerOptions {
  onSendMessage?: (msg: UiToBackendMessage) => void;
  onOpenNewSession?: () => void;
}

export class TabController {
  private _model: TabContainerModel;
  private _options: TabControllerOptions;
  private _unsubscribers: Map<string, () => void> = new Map();

  constructor(model: TabContainerModel, options: TabControllerOptions = {}) {
    this._model = model;
    this._options = options;
  }

  get model(): TabContainerModel {
    return this._model;
  }

  /**
   * 新しいタブを追加または既存タブをアクティブにする。
   */
  openTab(tab: TabItem, makeActive = true): TabItem {
    this._model.addTab(tab, makeActive);
    this._bindTabDirtyListener(tab);
    return tab;
  }

  /**
   * DiffSessionData からファイル比較タブを開く。
   */
  openDiffSession(
    session: DiffSessionData,
    makeActive = true,
    relPath?: string,
  ): TabItem {
    const existing = relPath ? this._model.findTabByPath(relPath) : undefined;
    if (existing) {
      if (existing.diffModel) {
        existing.diffModel.setSession(session);
      }
      if (makeActive) {
        this._model.setActiveTab(existing.id);
      }
      return existing;
    }

    let sessionType: TabSessionType = "2way";
    if (session.mode === "3way") {
      sessionType = "3way";
    } else if (session.mode === "image") {
      sessionType = "image";
    } else if (session.mode === "csv") {
      sessionType = "csv";
    }

    const title = this._resolveSessionTitle(session, relPath);
    const diffModel = new DiffSessionModel(session);
    const diffController = new DiffController(diffModel);

    // WebSocket / IPC 送信設定
    if (this._options.onSendMessage) {
      diffController.sendIpcMessage = (msg) =>
        this._options.onSendMessage!(msg);
    }

    let threeWayModel: ThreeWaySessionModel | undefined;
    let threeWayController: ThreeWayController | undefined;

    if (sessionType === "3way") {
      threeWayModel = new ThreeWaySessionModel(session);
      threeWayController = new ThreeWayController(threeWayModel, {
        sendMessage: (msg) => {
          if (this._options.onSendMessage) {
            this._options.onSendMessage(msg);
          }
        },
      });
    }

    const id = relPath ??
      `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tab: TabItem = {
      id,
      title,
      sessionType,
      diffModel,
      diffController,
      threeWayModel,
      threeWayController,
      relativePath: relPath,
      isDirty: false,
      closable: true,
    };

    return this.openTab(tab, makeActive);
  }

  /**
   * ディレクトリ比較セッションのタブを開く。
   */
  openDirectorySession(
    dirSession: DirectoryDiffSessionData,
    dirModel: DirectoryDiffModel,
    dirController: DirectoryController,
    makeActive = true,
  ): TabItem {
    const id = "dir-root";
    const existing = this._model.findTabById(id);
    if (existing) {
      if (makeActive) {
        this._model.setActiveTab(id);
      }
      return existing;
    }

    const title = dirSession.git?.isGitRepo
      ? `🌿 ${dirSession.git.branch ?? "Git"} (Working Tree)`
      : `${this._extractBaseName(dirSession.targetDir)} (Dir)`;

    const tab: TabItem = {
      id,
      title,
      sessionType: "directory",
      dirModel,
      dirController,
      isDirty: false,
      closable: true,
    };

    return this.openTab(tab, makeActive);
  }

  /**
   * Welcome 画面タブを開く。
   */
  openWelcomeTab(
    dirController?: DirectoryController,
    makeActive = true,
  ): TabItem {
    const id = "welcome";
    const existing = this._model.findTabById(id);
    if (existing) {
      if (makeActive) {
        this._model.setActiveTab(id);
      }
      return existing;
    }

    const tab: TabItem = {
      id,
      title: "Welcome",
      sessionType: "welcome",
      dirController,
      isDirty: false,
      closable: this._model.tabs.length > 0,
    };

    return this.openTab(tab, makeActive);
  }

  /**
   * 指定した ID のタブへ切り替える。
   */
  switchTab(id: string): void {
    this._model.setActiveTab(id);
  }

  /**
   * 次のタブへ切り替える。
   */
  nextTab(): void {
    this._model.nextTab();
  }

  /**
   * 前のタブへ切り替える。
   */
  prevTab(): void {
    this._model.prevTab();
  }

  /**
   * インデックス指定でタブへ切り替える。
   */
  switchToIndex(index: number): void {
    this._model.switchToIndex(index);
  }

  /**
   * タブのクローズをリクエストする。
   * 未保存変更がある場合は確認モーダルを表示し、なければ即座に閉じる。
   */
  requestCloseTab(id: string): void {
    const tab = this._model.findTabById(id);
    if (!tab) return;
    if (!tab.closable && this._model.tabs.length <= 1) return;

    if (tab.isDirty) {
      this._model.setPendingCloseTabId(id);
    } else {
      this.closeTabDirectly(id);
    }
  }

  /**
   * 現在のアクティブタブのクローズをリクエストする。
   */
  closeCurrentTab(): void {
    if (this._model.activeTabId) {
      this.requestCloseTab(this._model.activeTabId);
    }
  }

  /**
   * 確認なしで直接タブを閉じる。
   */
  closeTabDirectly(id: string): TabItem | null {
    const unsub = this._unsubscribers.get(id);
    if (unsub) {
      unsub();
      this._unsubscribers.delete(id);
    }

    const removed = this._model.removeTab(id);

    // 全てのタブが閉じられた場合、Welcome タブを開く
    if (this._model.tabs.length === 0) {
      this.openWelcomeTab();
    }

    return removed;
  }

  /**
   * 未保存確認ダイアログの決定を処理する。
   * @param saveFirst 保存してから閉じる場合は true、破棄して閉じる場合は false
   */
  confirmCloseTab(saveFirst: boolean): void {
    const tabId = this._model.pendingCloseTabId;
    if (!tabId) return;

    const tab = this._model.findTabById(tabId);
    if (!tab) {
      this._model.setPendingCloseTabId(null);
      return;
    }

    if (saveFirst) {
      if (tab.diffController) {
        tab.diffController.requestSave();
      } else if (tab.dirController && tab.relativePath) {
        tab.dirController.saveCurrentFile();
      }
      // 保存完了後にクローズ（同期的にフラグリセットされる想定または即時破棄）
    }

    this._model.setPendingCloseTabId(null);
    this.closeTabDirectly(tabId);
  }

  /**
   * 未保存確認ダイアログをキャンセルする。
   */
  cancelCloseTab(): void {
    this._model.setPendingCloseTabId(null);
  }

  /**
   * タブの並び順を変更する。
   */
  reorderTabs(fromIndex: number, toIndex: number): void {
    this._model.moveTab(fromIndex, toIndex);
  }

  /**
   * キーボードショートカットを処理する。
   * @returns イベントを処理した場合は true
   */
  handleKeyDown(e: KeyboardEvent): boolean {
    const isCtrl = e.ctrlKey || e.metaKey;

    // 1. Ctrl+W で現在のタブを閉じる
    if (
      isCtrl && !e.shiftKey && !e.altKey && (e.key === "w" || e.key === "W")
    ) {
      e.preventDefault();
      this.closeCurrentTab();
      return true;
    }

    // 2. Ctrl+Tab / Ctrl+PageDown で次のタブへ
    if (
      (isCtrl && !e.shiftKey && !e.altKey && e.key === "Tab") ||
      (isCtrl && !e.shiftKey && !e.altKey && e.key === "PageDown")
    ) {
      e.preventDefault();
      this.nextTab();
      return true;
    }

    // 3. Ctrl+Shift+Tab / Ctrl+PageUp で前のタブへ
    if (
      (isCtrl && e.shiftKey && !e.altKey && e.key === "Tab") ||
      (isCtrl && !e.shiftKey && !e.altKey && e.key === "PageUp")
    ) {
      e.preventDefault();
      this.prevTab();
      return true;
    }

    // 4. Ctrl+1 〜 Ctrl+9 で番号指定切り替え
    if (isCtrl && !e.shiftKey && !e.altKey && e.key >= "1" && e.key <= "9") {
      const targetIndex = parseInt(e.key, 10) - 1;
      if (targetIndex < this._model.tabs.length) {
        e.preventDefault();
        this.switchToIndex(targetIndex);
        return true;
      }
    }

    return false;
  }

  // --- 内部ヘルパー ---

  private _bindTabDirtyListener(tab: TabItem): void {
    if (this._unsubscribers.has(tab.id)) {
      this._unsubscribers.get(tab.id)!();
      this._unsubscribers.delete(tab.id);
    }

    if (tab.diffModel) {
      const unsub = tab.diffModel.subscribe((model) => {
        this._model.updateTabDirty(tab.id, model.isDirty);
      });
      this._unsubscribers.set(tab.id, unsub);
    }
  }

  private _resolveSessionTitle(
    session: DiffSessionData,
    relPath?: string,
  ): string {
    if (relPath) {
      return this._extractBaseName(relPath);
    }
    const rightName = this._extractBaseName(session.files.right.path);
    const leftName = this._extractBaseName(session.files.left.path);
    if (rightName === leftName) {
      return rightName;
    }
    return `${leftName} ↔ ${rightName}`;
  }

  private _extractBaseName(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || filePath;
  }

  /**
   * 現在の全タブ状態を WorkspaceState としてスナップショット化する（B17-01, B17-03）。
   */
  snapshotWorkspace(restoreOnStartup = true): WorkspaceState {
    const tabs: TabStateSnapshot[] = [];
    for (const tab of this._model.tabs) {
      if (tab.sessionType === "welcome") {
        tabs.push({
          id: tab.id,
          title: tab.title,
          sessionType: "welcome",
        });
        continue;
      }

      if (tab.sessionType === "directory" && tab.dirModel?.dirSession) {
        const ds = tab.dirModel.dirSession;
        tabs.push({
          id: tab.id,
          title: tab.title,
          sessionType: "directory",
          baseDir: ds.baseDir,
          targetDir: ds.targetDir,
          selectedPath: tab.dirModel.selectedPath ?? undefined,
          expandedPaths: Array.from(tab.dirModel.expandedDirs),
          readOnly: ds.readOnly,
          prompt: ds.aiContext?.prompt,
          agent: ds.aiContext?.agent,
          model: ds.aiContext?.model,
        });
        continue;
      }

      if (tab.sessionType === "3way") {
        const s = tab.threeWayModel?.session ?? tab.diffModel?.session;
        if (s) {
          const hunkStatuses: Record<
            string,
            import("../../core/types.ts").HunkStatus
          > = {};
          for (const hunk of s.hunks) {
            hunkStatuses[hunk.id] = hunk.status;
          }
          tabs.push({
            id: tab.id,
            title: tab.title,
            sessionType: "3way",
            leftPath: s.files.left.path,
            basePath: s.files.base?.path,
            rightPath: s.files.right.path,
            outputPath: s.outputPath,
            readOnly: s.files.right.readOnly,
            prompt: s.aiContext?.prompt,
            agent: s.aiContext?.agent,
            model: s.aiContext?.model,
            hunkStatuses,
          });
        }
        continue;
      }

      const diffSession = tab.diffModel?.session;
      if (diffSession) {
        const hunkStatuses: Record<
          string,
          import("../../core/types.ts").HunkStatus
        > = {};
        for (const hunk of diffSession.hunks) {
          hunkStatuses[hunk.id] = hunk.status;
        }
        tabs.push({
          id: tab.id,
          title: tab.title,
          sessionType: tab.sessionType,
          relativePath: tab.relativePath,
          leftPath: diffSession.files.left.path,
          rightPath: diffSession.files.right.path,
          outputPath: diffSession.outputPath,
          readOnly: diffSession.files.right.readOnly,
          prompt: diffSession.aiContext?.prompt,
          agent: diffSession.aiContext?.agent,
          model: diffSession.aiContext?.model,
          hunkStatuses,
        });
      }
    }

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      restoreOnStartup,
      activeTabId: this._model.activeTabId,
      tabs,
    };
  }

  /**
   * WorkspaceState から各タブのセッションを再開する（B17-02, B17-03）。
   */
  restoreWorkspaceState(
    state: WorkspaceState,
    dirController?: DirectoryController,
  ): void {
    if (!state.tabs || state.tabs.length === 0) return;

    for (const snap of state.tabs) {
      if (snap.sessionType === "welcome") {
        this.openWelcomeTab(dirController, false);
      } else if (
        snap.sessionType === "directory" &&
        snap.baseDir &&
        snap.targetDir
      ) {
        if (dirController) {
          dirController.startDirectorySession(
            snap.baseDir,
            snap.targetDir,
            snap.readOnly,
          );
        }
      } else if (
        (snap.sessionType === "2way" ||
          snap.sessionType === "image" ||
          snap.sessionType === "csv") &&
        snap.leftPath &&
        snap.rightPath
      ) {
        if (dirController) {
          dirController.startFileSession(
            snap.leftPath,
            snap.rightPath,
            snap.readOnly,
          );
        }
      }
    }

    if (state.activeTabId) {
      this._model.setActiveTab(state.activeTabId);
    }
  }
}
