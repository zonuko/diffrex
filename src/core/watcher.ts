/**
 * 外部ファイル・ディレクトリ変更監視マネージャー（B16-01）。
 * Deno.watchFs を用いて監視対象の変更を検出し、デバウンス処理と自己保存イベント除外を行う。
 */

import { dirname, resolve } from "@std/path";

export interface FileChangeEvent {
  path: string;
  kind: "modify" | "create" | "remove" | "other";
  timestamp: number;
  isDirectory?: boolean;
}

export type FileChangeHandler = (event: FileChangeEvent) => void;

export interface FileWatcherOptions {
  debounceMs?: number;
  selfSaveWindowMs?: number;
}

/** パスを正規化して比較可能にする（Windows は小文字化・区切り文字統一） */
export function normalizeWatcherPath(p: string): string {
  const resolved = resolve(p).replace(/\\/g, "/");
  return Deno.build.os === "windows" ? resolved.toLowerCase() : resolved;
}

/** 一時ファイルやロックファイル等の無視判定 */
export function isIgnoredWatcherFile(path: string): boolean {
  const norm = path.replace(/\\/g, "/").toLowerCase();
  const segments = norm.split("/");
  const fileName = segments[segments.length - 1] || "";

  // メタディレクトリ・内部ディレクトリの除外（.git, node_modules, .deno, dist など）
  for (const seg of segments) {
    if (
      seg === ".git" ||
      seg === "node_modules" ||
      seg === ".deno" ||
      seg === "dist"
    ) {
      return true;
    }
  }

  // Diffrex 自身の一時保存ファイル
  if (fileName.includes(".diffrex_tmp_")) return true;
  // Git ロックファイル
  if (fileName.endsWith(".lock")) return true;
  // 一時スワップファイル
  if (
    fileName.endsWith(".swp") || fileName.endsWith(".tmp") ||
    fileName.endsWith("~")
  ) {
    return true;
  }
  return false;
}

interface ActiveDirWatcher {
  watcher: Deno.FsWatcher;
  abortController: AbortController;
  isRecursive: boolean;
  /** 監視対象の個別ファイル一覧（空の場合はディレクトリ全体を対象） */
  trackedFiles: Set<string>;
}

export class FileWatcher {
  private _debounceMs: number;
  private _selfSaveWindowMs: number;
  private _handlers: Set<FileChangeHandler> = new Set();
  private _dirWatchers: Map<string, ActiveDirWatcher> = new Map();
  private _selfSavedPaths: Map<string, number> = new Map();
  private _debounceTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  private _isClosed = false;

  constructor(options: FileWatcherOptions = {}) {
    this._debounceMs = options.debounceMs ?? 150;
    this._selfSaveWindowMs = options.selfSaveWindowMs ?? 1500;
  }

  get isClosed(): boolean {
    return this._isClosed;
  }

  /**
   * 変更通知ハンドラを登録する。戻り値の関数で登録解除可能。
   */
  onChange(handler: FileChangeHandler): () => void {
    this._handlers.add(handler);
    return () => {
      this._handlers.delete(handler);
    };
  }

  /**
   * Diffrex 自身による保存であることを記録し、一定時間内の変更イベントを除外する。
   */
  markSelfSave(filePath: string, durationMs?: number): void {
    const norm = normalizeWatcherPath(filePath);
    const expiresAt = Date.now() + (durationMs ?? this._selfSaveWindowMs);
    this._selfSavedPaths.set(norm, expiresAt);
  }

  /**
   * 指定したパスが Diffrex 自身の保存による抑止期間中か判定する。
   */
  isSelfSaved(filePath: string): boolean {
    const norm = normalizeWatcherPath(filePath);
    const expiresAt = this._selfSavedPaths.get(norm);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this._selfSavedPaths.delete(norm);
      return false;
    }
    return true;
  }

  /**
   * ファイルまたはディレクトリを監視対象に登録する。
   */
  registerPath(targetPath: string, options?: { isDirectory?: boolean }): void {
    if (this._isClosed) return;
    if (targetPath === "<stdin>" || targetPath.startsWith("<")) return;

    let isDirectory = options?.isDirectory;
    if (isDirectory === undefined) {
      try {
        const stat = Deno.statSync(targetPath);
        isDirectory = stat.isDirectory;
      } catch {
        // ファイル未作成の場合は親ディレクトリのファイル監視とする
        isDirectory = false;
      }
    }

    if (isDirectory) {
      this._watchDirectory(targetPath, true);
    } else {
      const parentDir = dirname(targetPath);
      this._watchDirectory(parentDir, false, targetPath);
    }
  }

  /**
   * セッションデータから監視対象パスを一括登録する。
   */
  registerSession(session: {
    mode?: string;
    baseDir?: string;
    targetDir?: string;
    git?: { tempWorktreePath?: string };
    files?: {
      left?: { path?: string };
      right?: { path?: string };
      base?: { path?: string };
    };
    outputPath?: string;
  }): void {
    if (this._isClosed) return;

    if (session.mode === "directory") {
      const isGitTemp = session.git?.tempWorktreePath &&
        session.baseDir === session.git.tempWorktreePath;
      if (session.baseDir && !isGitTemp) {
        this.registerPath(session.baseDir, { isDirectory: true });
      }
      if (session.targetDir) {
        this.registerPath(session.targetDir, { isDirectory: true });
      }
      return;
    }

    if (session.files?.left?.path) {
      this.registerPath(session.files.left.path);
    }
    if (session.files?.right?.path) {
      this.registerPath(session.files.right.path);
    }
    if (session.files?.base?.path) {
      this.registerPath(session.files.base.path);
    }
    if (session.outputPath) {
      this.registerPath(session.outputPath);
    }
  }

  /**
   * 指定したパスの監視を解除する。
   */
  unregisterPath(targetPath: string): void {
    const norm = normalizeWatcherPath(targetPath);
    for (const [dirKey, entry] of this._dirWatchers.entries()) {
      if (entry.isRecursive && dirKey === norm) {
        this._stopWatcher(dirKey);
        break;
      } else if (!entry.isRecursive && entry.trackedFiles.has(norm)) {
        entry.trackedFiles.delete(norm);
        if (entry.trackedFiles.size === 0) {
          this._stopWatcher(dirKey);
        }
        break;
      }
    }
  }

  /**
   * すべての監視を解除する（インスタンスは再利用可能）。
   */
  clear(): void {
    for (const key of Array.from(this._dirWatchers.keys())) {
      this._stopWatcher(key);
    }
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();
    this._selfSavedPaths.clear();
  }

  /**
   * 監視マネージャーを完全に破棄する。
   */
  close(): void {
    this._isClosed = true;
    this.clear();
    this._handlers.clear();
  }

  // --- 内部実装 ---

  private _watchDirectory(
    dirPath: string,
    isRecursive: boolean,
    specificFile?: string,
  ): void {
    const normDir = normalizeWatcherPath(dirPath);
    const existing = this._dirWatchers.get(normDir);

    if (existing) {
      if (specificFile) {
        existing.trackedFiles.add(normalizeWatcherPath(specificFile));
      }
      if (isRecursive && !existing.isRecursive) {
        // 再帰モードへ昇格
        this._stopWatcher(normDir);
      } else {
        return;
      }
    }

    let fsWatcher: Deno.FsWatcher;
    try {
      fsWatcher = Deno.watchFs(dirPath, { recursive: isRecursive });
    } catch (err) {
      console.warn(`FileWatcher: Failed to watch ${dirPath}:`, err);
      return;
    }

    const abortController = new AbortController();
    const entry: ActiveDirWatcher = {
      watcher: fsWatcher,
      abortController,
      isRecursive,
      trackedFiles: new Set(),
    };

    if (specificFile) {
      entry.trackedFiles.add(normalizeWatcherPath(specificFile));
    }

    this._dirWatchers.set(normDir, entry);

    // 非同期イテレーションの開始
    (async () => {
      try {
        for await (const fsEvent of fsWatcher) {
          if (abortController.signal.aborted || this._isClosed) break;

          for (const rawPath of fsEvent.paths) {
            if (isIgnoredWatcherFile(rawPath)) continue;

            const normPath = normalizeWatcherPath(rawPath);

            // 特定ファイル監視モードの場合、登録対象外のファイル変更は無視
            if (!entry.isRecursive && !entry.trackedFiles.has(normPath)) {
              continue;
            }

            // 自己保存による変更イベントは無視
            if (this.isSelfSaved(normPath)) {
              continue;
            }

            // イベント種別のマッピング
            let kind: FileChangeEvent["kind"] = "modify";
            if (fsEvent.kind === "create") kind = "create";
            else if (fsEvent.kind === "remove") kind = "remove";
            else if (fsEvent.kind === "modify") kind = "modify";
            else kind = "other";

            this._enqueueChangeEvent({
              path: rawPath,
              kind,
              timestamp: Date.now(),
              isDirectory: entry.isRecursive,
            });
          }
        }
      } catch {
        // 監視終了またはディレクトリ削除時は静かに抜ける
      }
    })();
  }

  private _stopWatcher(dirKey: string): void {
    const entry = this._dirWatchers.get(dirKey);
    if (entry) {
      entry.abortController.abort();
      try {
        entry.watcher.close();
      } catch {
        // ignore
      }
      this._dirWatchers.delete(dirKey);
    }
  }

  private _enqueueChangeEvent(event: FileChangeEvent): void {
    const norm = normalizeWatcherPath(event.path);

    const existingTimer = this._debounceTimers.get(norm);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this._debounceTimers.delete(norm);
      if (this._isClosed) return;
      if (this.isSelfSaved(norm)) return;

      for (const handler of this._handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error("FileWatcher: handler error:", err);
        }
      }
    }, this._debounceMs);

    this._debounceTimers.set(norm, timer);
  }
}
