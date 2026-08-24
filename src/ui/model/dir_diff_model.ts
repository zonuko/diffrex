/**
 * DirectoryDiffModel (B1-07 Smalltalk-80 MVC Model)
 *
 * ディレクトリ比較セッションのツリー構造、選択中ノード、フィルタ、各ファイルの Diff 状態を管理する。
 */

import type {
  DiffSessionData,
  DirectoryDiffSessionData,
  DirectoryTreeNode,
  FileDiffStatus,
  HistoryEntry,
  SessionSnapshot,
} from "../../core/types.ts";
import { Observable } from "./observable.ts";

export class DirectoryDiffModel extends Observable<DirectoryDiffModel> {
  private _dirSession: DirectoryDiffSessionData | null = null;
  private _selectedPath: string | null = null;
  private _expandedDirs: Set<string> = new Set();
  private _filterStatus: FileDiffStatus | "all" = "all";
  private _filterText: string = "";
  private _activeFileSession: DiffSessionData | null = null;
  private _isLoadingFile: boolean = false;
  private _fileError: string | null = null;
  private _dirtyFiles: Set<string> = new Set();
  private _history: HistoryEntry[] = [];
  private _lastSession: SessionSnapshot | null = null;

  constructor(initialSession: DirectoryDiffSessionData | null = null) {
    super();
    if (initialSession) {
      this.setDirSession(initialSession);
    }
  }

  // --- 状態ゲッター ---

  get dirSession(): DirectoryDiffSessionData | null {
    return this._dirSession;
  }

  get selectedPath(): string | null {
    return this._selectedPath;
  }

  get expandedDirs(): ReadonlySet<string> {
    return this._expandedDirs;
  }

  get filterStatus(): FileDiffStatus | "all" {
    return this._filterStatus;
  }

  get filterText(): string {
    return this._filterText;
  }

  get activeFileSession(): DiffSessionData | null {
    return this._activeFileSession;
  }

  get isLoadingFile(): boolean {
    return this._isLoadingFile;
  }

  get fileError(): string | null {
    return this._fileError;
  }

  get dirtyFiles(): ReadonlySet<string> {
    return this._dirtyFiles;
  }

  get hasDirtyFiles(): boolean {
    return this._dirtyFiles.size > 0;
  }

  get history(): readonly HistoryEntry[] {
    return this._history;
  }

  get lastSession(): SessionSnapshot | null {
    return this._lastSession;
  }

  // --- ドメインミューテーション ---

  setHistoryData(
    history: HistoryEntry[],
    lastSession: SessionSnapshot | null,
  ): void {
    this._history = history;
    this._lastSession = lastSession;
    this.notify(this);
  }

  removeHistoryItem(id: string): void {
    this._history = this._history.filter((item) => item.id !== id);
    this.notify(this);
  }

  setDirSession(session: DirectoryDiffSessionData): void {
    this._dirSession = session;
    this._selectedPath = null;
    this._activeFileSession = null;
    this._dirtyFiles.clear();

    // デフォルトでルート直下を展開
    this._expandedDirs.clear();
    this._expandedDirs.add("");
    if (session.tree.children) {
      for (const child of session.tree.children) {
        if (child.isDir) {
          this._expandedDirs.add(child.relativePath);
        }
      }
    }

    // 最初の変更ファイルを選択
    const firstDiff = this.findFirstDiffFile(session.tree);
    if (firstDiff) {
      this._selectedPath = firstDiff.relativePath;
    }

    this.notify(this);
  }

  toggleDir(relPath: string): void {
    if (this._expandedDirs.has(relPath)) {
      this._expandedDirs.delete(relPath);
    } else {
      this._expandedDirs.add(relPath);
    }
    this.notify(this);
  }

  expandAll(): void {
    if (!this._dirSession) return;
    const addAll = (node: DirectoryTreeNode) => {
      if (node.isDir) {
        this._expandedDirs.add(node.relativePath);
        node.children?.forEach(addAll);
      }
    };
    addAll(this._dirSession.tree);
    this.notify(this);
  }

  collapseAll(): void {
    this._expandedDirs.clear();
    this.notify(this);
  }

  setSelectedPath(path: string | null): void {
    if (this._selectedPath === path) return;
    this._selectedPath = path;
    this._activeFileSession = null;
    this._fileError = null;
    this.notify(this);
  }

  setFilterStatus(status: FileDiffStatus | "all"): void {
    this._filterStatus = status;
    this.notify(this);
  }

  setFilterText(text: string): void {
    this._filterText = text;
    this.notify(this);
  }

  startLoadingFile(path: string): void {
    this._selectedPath = path;
    this._isLoadingFile = true;
    this._fileError = null;
    this.notify(this);
  }

  setActiveFileSession(
    path: string,
    session: DiffSessionData | null,
    error?: string,
  ): void {
    if (this._selectedPath === path) {
      this._isLoadingFile = false;
      this._activeFileSession = session;
      this._fileError = error ?? null;
      this.notify(this);
    }
  }

  setFileDirty(path: string, isDirty: boolean): void {
    if (isDirty) {
      this._dirtyFiles.add(path);
    } else {
      this._dirtyFiles.delete(path);
    }
    this.notify(this);
  }

  // --- ヘルパー ---

  private findFirstDiffFile(
    node: DirectoryTreeNode,
  ): DirectoryTreeNode | null {
    if (!node.isDir && node.status !== "identical") {
      return node;
    }
    if (node.children) {
      for (const child of node.children) {
        const found = this.findFirstDiffFile(child);
        if (found) return found;
      }
    }
    return null;
  }
}
