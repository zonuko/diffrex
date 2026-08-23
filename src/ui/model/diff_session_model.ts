/**
 * DiffSessionModel (Smalltalk-80 スタイル Active Domain Model)
 *
 * アプリケーションの状態（DiffSessionData, chunks, 選択中インデックス, モード, 保存状態等）を
 * 保持し、ドメインロジックを実行して状態変更時に Observer へ通知する。
 */

import type { Chunk } from "@codemirror/merge";
import type { DiffSessionData, HunkAnnotation } from "../../core/types.ts";
import { Observable } from "./observable.ts";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
export type NavigationMode = "navigation" | "editing";

export interface SaveStatus {
  status: "idle" | "saving" | "saved" | "error";
  message?: string;
}

export interface DiffSessionModelState {
  session: DiffSessionData | null;
  connectionStatus: ConnectionStatus;
  chunks: readonly Chunk[];
  activeChunkIndex: number;
  mode: NavigationMode;
  statusMessage: string;
  saveStatus: SaveStatus;
  isDirty: boolean;
  noiseFolded: boolean;
  expandedHunkIds: ReadonlySet<string>;
}

export class DiffSessionModel extends Observable<DiffSessionModel> {
  private _session: DiffSessionData | null = null;
  private _connectionStatus: ConnectionStatus = "connecting";
  private _chunks: readonly Chunk[] = [];
  private _activeChunkIndex: number = 0;
  private _mode: NavigationMode = "navigation";
  private _statusMessage: string = "";
  private _saveStatus: SaveStatus = { status: "idle" };
  private _isDirty: boolean = false;
  private _noiseFolded: boolean = true;
  private _expandedHunkIds: Set<string> = new Set();

  constructor(initialSession: DiffSessionData | null = null) {
    super();
    this._session = initialSession;
  }

  // --- 状態ゲッター ---

  get session(): DiffSessionData | null {
    return this._session;
  }

  get connectionStatus(): ConnectionStatus {
    return this._connectionStatus;
  }

  get chunks(): readonly Chunk[] {
    return this._chunks;
  }

  get activeChunkIndex(): number {
    return this._activeChunkIndex;
  }

  get activeChunk(): Chunk | null {
    if (
      this._activeChunkIndex >= 0 &&
      this._activeChunkIndex < this._chunks.length
    ) {
      return this._chunks[this._activeChunkIndex];
    }
    return null;
  }

  get mode(): NavigationMode {
    return this._mode;
  }

  get statusMessage(): string {
    return this._statusMessage;
  }

  get saveStatus(): SaveStatus {
    return this._saveStatus;
  }

  get isDirty(): boolean {
    return this._isDirty;
  }

  get isReadOnly(): boolean {
    return Boolean(this._session?.files?.right?.readOnly);
  }

  get noiseFolded(): boolean {
    return this._noiseFolded;
  }

  get expandedHunkIds(): ReadonlySet<string> {
    return this._expandedHunkIds;
  }

  get unreviewedCount(): number {
    if (!this._session?.hunks) return 0;
    return this._session.hunks.filter((h) => h.status === "unreviewed").length;
  }

  get reviewedCount(): number {
    if (!this._session?.hunks) return 0;
    return this._session.hunks.filter((h) => h.status !== "unreviewed").length;
  }

  get statusCounts(): {
    unreviewed: number;
    accepted: number;
    rejected: number;
    edited: number;
  } {
    const counts = { unreviewed: 0, accepted: 0, rejected: 0, edited: 0 };
    if (!this._session?.hunks) return counts;
    for (const h of this._session.hunks) {
      if (h.status === "accepted") counts.accepted++;
      else if (h.status === "rejected") counts.rejected++;
      else if (h.status === "edited") counts.edited++;
      else counts.unreviewed++;
    }
    return counts;
  }

  get isAllReviewed(): boolean {
    const total = this._session?.hunks?.length ?? 0;
    return total > 0 && this.unreviewedCount === 0;
  }

  get noiseCount(): number {
    if (!this._session?.hunks) return 0;
    return this._session.hunks.filter((h) => h.isNoise).length;
  }

  get riskCounts(): { danger: number; warning: number; normal: number } {
    const counts = { danger: 0, warning: 0, normal: 0 };
    if (!this._session?.hunks) return counts;
    for (const h of this._session.hunks) {
      if (h.riskLevel === "danger") counts.danger++;
      else if (h.riskLevel === "warning") counts.warning++;
      else counts.normal++;
    }
    return counts;
  }

  get state(): Readonly<DiffSessionModelState> {
    return {
      session: this._session,
      connectionStatus: this._connectionStatus,
      chunks: this._chunks,
      activeChunkIndex: this._activeChunkIndex,
      mode: this._mode,
      statusMessage: this._statusMessage,
      saveStatus: this._saveStatus,
      isDirty: this._isDirty,
      noiseFolded: this._noiseFolded,
      expandedHunkIds: this._expandedHunkIds,
    };
  }

  // --- ドメインロジック / 状態変更メソッド ---

  /**
   * セッションデータを設定する。
   */
  setSession(session: DiffSessionData | null): void {
    this._session = session;
    this._isDirty = false;
    this._expandedHunkIds.clear();
    this.notify(this);
  }

  /**
   * ノイズ hunk の一括折りたたみ状態を設定する。
   */
  setNoiseFolded(folded: boolean): void {
    if (this._noiseFolded !== folded) {
      this._noiseFolded = folded;
      this.notify(this);
    }
  }

  /**
   * ノイズ hunk の一括折りたたみ状態を反転する。
   */
  toggleNoiseFolded(): void {
    this._noiseFolded = !this._noiseFolded;
    this.notify(this);
  }

  /**
   * 個別 hunk の展開/折りたたみ状態を切り替える。
   */
  toggleHunkFold(hunkId: string): void {
    if (this._expandedHunkIds.has(hunkId)) {
      this._expandedHunkIds.delete(hunkId);
    } else {
      this._expandedHunkIds.add(hunkId);
    }
    this.notify(this);
  }

  /**
   * 対象 hunk が現在折りたたまれているかどうか判定する。
   */
  isHunkFolded(hunkId: string, isNoise: boolean): boolean {
    if (!isNoise) return false;
    if (!this._noiseFolded) {
      // 一括展開時でも個別に折りたたまれているか（必要に応じて拡張可能だが基本は noiseFolded を基点とする）
      return false;
    }
    return !this._expandedHunkIds.has(hunkId);
  }

  /**
   * 通信接続状態を設定する。
   */
  setConnectionStatus(status: ConnectionStatus): void {
    if (this._connectionStatus !== status) {
      this._connectionStatus = status;
      this.notify(this);
    }
  }

  /**
   * CodeMirror から取得した差分 Chunk リストを設定する。
   */
  setChunks(chunks: readonly Chunk[], newActiveIndex?: number): void {
    this._chunks = chunks;
    if (newActiveIndex !== undefined) {
      this._activeChunkIndex = newActiveIndex;
    } else if (chunks.length === 0) {
      this._activeChunkIndex = -1;
      this._statusMessage = "すべての差分が解消されました";
    } else if (this._activeChunkIndex >= chunks.length) {
      this._activeChunkIndex = chunks.length - 1;
    } else if (this._activeChunkIndex < 0) {
      this._activeChunkIndex = 0;
    }
    this.notify(this);
  }

  /**
   * アクティブな Hunk インデックスを直接設定する。
   */
  setActiveChunkIndex(index: number): void {
    const clamped = this._chunks.length === 0
      ? -1
      : Math.max(0, Math.min(index, this._chunks.length - 1));
    if (this._activeChunkIndex !== clamped) {
      this._activeChunkIndex = clamped;
      this.notify(this);
    }
  }

  /**
   * Chunk インデックスから対応する HunkAnnotation を探索する。
   */
  getAnnotationForChunkIndex(index: number): HunkAnnotation | undefined {
    if (!this._session?.hunks || index < 0 || index >= this._chunks.length) {
      return undefined;
    }
    // hunks の順序と chunks の順序が対応（またはインデックス範囲一致）
    if (index < this._session.hunks.length) {
      return this._session.hunks[index];
    }
    return undefined;
  }

  /**
   * 指定したインデックスの Chunk が現在折りたたまれている noise かどうか。
   */
  isChunkFoldedNoise(index: number): boolean {
    const annotation = this.getAnnotationForChunkIndex(index);
    if (!annotation) return false;
    return this.isHunkFolded(annotation.id, annotation.isNoise);
  }

  /**
   * 次の Hunk を選択（折りたたみ中の noise をスキップ、ラップアラウンド）。
   */
  selectNextHunk(): void {
    if (this._chunks.length === 0) return;

    // noiseFolded が有効なら、展開されていない noise はスキップ
    let next = this._activeChunkIndex;
    for (let i = 0; i < this._chunks.length; i++) {
      next = (next + 1) % this._chunks.length;
      if (!this.isChunkFoldedNoise(next)) {
        this._activeChunkIndex = next;
        this.notify(this);
        return;
      }
    }

    // 全てが折りたたまれている場合は単純に進める
    this._activeChunkIndex = (this._activeChunkIndex + 1) % this._chunks.length;
    this.notify(this);
  }

  /**
   * 前の Hunk を選択（折りたたみ中の noise をスキップ、ラップアラウンド）。
   */
  selectPrevHunk(): void {
    if (this._chunks.length === 0) return;

    let prev = this._activeChunkIndex;
    for (let i = 0; i < this._chunks.length; i++) {
      prev = (prev - 1 + this._chunks.length) % this._chunks.length;
      if (!this.isChunkFoldedNoise(prev)) {
        this._activeChunkIndex = prev;
        this.notify(this);
        return;
      }
    }

    // 全てが折りたたまれている場合は単純に戻す
    this._activeChunkIndex =
      (this._activeChunkIndex - 1 + this._chunks.length) % this._chunks.length;
    this.notify(this);
  }

  /**
   * ナビゲーション / 編集モードを設定する。
   */
  setMode(mode: NavigationMode): void {
    if (this._mode !== mode) {
      this._mode = mode;
      this.notify(this);
    }
  }

  /**
   * ステータスメッセージを設定する。
   */
  setStatusMessage(message: string): void {
    if (this._statusMessage !== message) {
      this._statusMessage = message;
      this.notify(this);
    }
  }

  /**
   * 未保存フラグ（Dirty 状態）を設定する。
   */
  setDirty(dirty: boolean): void {
    if (this._isDirty !== dirty) {
      this._isDirty = dirty;
      this.notify(this);
    }
  }

  /**
   * 特定の Hunk のレビュー状態（HunkStatus）を更新する。
   */
  setHunkStatus(
    target: number | string,
    status: import("../../core/types.ts").HunkStatus,
  ): void {
    if (!this._session?.hunks) return;
    let hunk: HunkAnnotation | undefined;
    if (typeof target === "number") {
      hunk = this.getAnnotationForChunkIndex(target);
    } else {
      hunk = this._session.hunks.find((h) => h.id === target);
    }

    if (hunk && hunk.status !== status) {
      hunk.status = status;
      this.checkAllReviewed();
      this.notify(this);
    }
  }

  /**
   * 現在アクティブな Hunk を承認 (accepted) にし、次の未レビュー Hunk へ移動する (P4-12)。
   */
  acceptCurrentHunk(): void {
    if (!this._session?.hunks || this._chunks.length === 0) return;
    const annotation = this.getAnnotationForChunkIndex(this._activeChunkIndex);
    if (annotation) {
      annotation.status = "accepted";
    }
    const allDone = this.checkAllReviewed();
    this.selectNextUnreviewedHunk();
    if (allDone) {
      this.setStatusMessage(
        "✨ 全ての差分のレビューが完了しました (Ctrl+Enter で保存して終了)",
      );
    }
    this.notify(this);
  }

  /**
   * 現在アクティブな Hunk を拒否 (rejected) にし、次の未レビュー Hunk へ移動する (P4-13)。
   */
  rejectCurrentHunk(): void {
    if (!this._session?.hunks || this._chunks.length === 0) return;
    const annotation = this.getAnnotationForChunkIndex(this._activeChunkIndex);
    if (annotation) {
      annotation.status = "rejected";
    }
    const allDone = this.checkAllReviewed();
    this.selectNextUnreviewedHunk();
    if (allDone) {
      this.setStatusMessage(
        "✨ 全ての差分のレビューが完了しました (Ctrl+Enter で保存して終了)",
      );
    }
    this.notify(this);
  }

  /**
   * 対象またはアクティブな Hunk を編集済み (edited) に更新する (P4-14)。
   */
  markCurrentHunkEdited(chunkIndex?: number): void {
    if (!this._session?.hunks) return;
    const idx = chunkIndex !== undefined ? chunkIndex : this._activeChunkIndex;
    const annotation = this.getAnnotationForChunkIndex(idx);
    if (annotation && annotation.status !== "edited") {
      annotation.status = "edited";
      const allDone = this.checkAllReviewed();
      if (allDone) {
        this.setStatusMessage(
          "✨ 全ての差分のレビューが完了しました (Ctrl+Enter で保存して終了)",
        );
      }
      this.notify(this);
    }
  }

  /**
   * 次の未レビュー (unreviewed) な Hunk を探索して選択する。
   */
  selectNextUnreviewedHunk(): void {
    if (!this._session?.hunks || this._chunks.length === 0) return;
    if (this.unreviewedCount === 0) return;

    let next = this._activeChunkIndex;
    for (let i = 0; i < this._chunks.length; i++) {
      next = (next + 1) % this._chunks.length;
      const annotation = this.getAnnotationForChunkIndex(next);
      if (annotation && annotation.status === "unreviewed") {
        this._activeChunkIndex = next;
        return;
      }
    }
  }

  /**
   * 全件レビュー完了かチェックし、必要に応じて完了通知メッセージを設定する。
   */
  private checkAllReviewed(): boolean {
    return this.isAllReviewed;
  }

  /**
   * 保存ステータスを設定する。
   */
  setSaveStatus(status: SaveStatus): void {
    this._saveStatus = status;
    if (status.status === "saved") {
      this._isDirty = false;
    }
    this.notify(this);
  }
}
