/**
 * ThreeWaySessionModel (Smalltalk-80 スタイル Active Domain Model for 3-Way Merge)
 *
 * 3-Way マージの状態（Local / Base / Remote / MergedContent, 競合一覧, 解決状態）を
 * 保持し、マージ・解決アクションを実行して Observer へ通知する。
 */

import type {
  ConflictResolution,
  DiffSessionData,
  ThreeWayHunk,
} from "../../core/types.ts";
import { Observable } from "./observable.ts";
import type {
  ConnectionStatus,
  NavigationMode,
  SaveStatus,
} from "./diff_session_model.ts";

export class ThreeWaySessionModel extends Observable<ThreeWaySessionModel> {
  private _session: DiffSessionData | null = null;
  private _connectionStatus: ConnectionStatus = "connecting";
  private _hunks: ThreeWayHunk[] = [];
  private _activeHunkIndex: number = 0;
  private _resolutions: Map<string, ConflictResolution> = new Map();
  private _mergedContent: string = "";
  private _mode: NavigationMode = "navigation";
  private _statusMessage: string = "";
  private _saveStatus: SaveStatus = { status: "idle" };
  private _isDirty: boolean = false;

  constructor(initialSession: DiffSessionData | null = null) {
    super();
    if (initialSession) {
      this.setSession(initialSession);
    }
  }

  // --- ゲッター ---

  get session(): DiffSessionData | null {
    return this._session;
  }

  get connectionStatus(): ConnectionStatus {
    return this._connectionStatus;
  }

  get hunks(): readonly ThreeWayHunk[] {
    return this._hunks;
  }

  get conflicts(): readonly ThreeWayHunk[] {
    return this._hunks.filter((h) => h.type === "conflict");
  }

  get activeHunkIndex(): number {
    return this._activeHunkIndex;
  }

  get activeHunk(): ThreeWayHunk | null {
    if (
      this._activeHunkIndex >= 0 && this._activeHunkIndex < this._hunks.length
    ) {
      return this._hunks[this._activeHunkIndex];
    }
    return null;
  }

  get mergedContent(): string {
    return this._mergedContent;
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
    return Boolean(
      this._session?.options &&
        (this._session as unknown as { readOnly?: boolean }).readOnly,
    );
  }

  get totalConflicts(): number {
    return this.conflicts.length;
  }

  get resolvedConflictsCount(): number {
    return this.conflicts.filter((h) => {
      const res = this._resolutions.get(h.id);
      return res && res !== "unresolved";
    }).length;
  }

  get remainingConflictsCount(): number {
    return this.totalConflicts - this.resolvedConflictsCount;
  }

  getResolution(hunkId: string): ConflictResolution {
    return this._resolutions.get(hunkId) ?? "unresolved";
  }

  // --- ドメインロジック / 状態変更アクション ---

  setConnectionStatus(status: ConnectionStatus): void {
    if (this._connectionStatus === status) return;
    this._connectionStatus = status;
    this.notify(this);
  }

  setSession(session: DiffSessionData): void {
    this._session = session;
    this._hunks = session.threeWay ? [...session.threeWay.hunks] : [];
    this._resolutions.clear();

    for (const h of this._hunks) {
      this._resolutions.set(h.id, h.resolution);
    }

    this._mergedContent = session.threeWay?.initialMergedContent ??
      session.files.left.content;
    this._activeHunkIndex = 0;
    this._isDirty = false;
    this._saveStatus = { status: "idle" };
    this._statusMessage = `3-Way マージ準備完了 (${this.totalConflicts} 競合)`;
    this.notify(this);
  }

  setMergedContent(content: string, markDirty = true): void {
    if (this._mergedContent === content) return;
    this._mergedContent = content;
    if (markDirty) {
      this._isDirty = true;
    }
    this.notify(this);
  }

  setActiveHunkIndex(index: number): void {
    if (this._hunks.length === 0) return;
    const clamped = Math.max(0, Math.min(index, this._hunks.length - 1));
    if (this._activeHunkIndex === clamped) return;
    this._activeHunkIndex = clamped;
    this.notify(this);
  }

  goToNextConflict(): void {
    const conflictIndices = this._hunks
      .map((h, i) => (h.type === "conflict" ? i : -1))
      .filter((i) => i >= 0);

    if (conflictIndices.length === 0) return;

    const next = conflictIndices.find((i) => i > this._activeHunkIndex);
    if (next !== undefined) {
      this.setActiveHunkIndex(next);
    } else {
      // 最初に戻る
      this.setActiveHunkIndex(conflictIndices[0]);
    }
  }

  goToPrevConflict(): void {
    const conflictIndices = this._hunks
      .map((h, i) => (h.type === "conflict" ? i : -1))
      .filter((i) => i >= 0);

    if (conflictIndices.length === 0) return;

    const prevs = conflictIndices.filter((i) => i < this._activeHunkIndex);
    if (prevs.length > 0) {
      this.setActiveHunkIndex(prevs[prevs.length - 1]);
    } else {
      // 最後に飛ぶ
      this.setActiveHunkIndex(conflictIndices[conflictIndices.length - 1]);
    }
  }

  resolveHunk(hunkId: string, resolution: ConflictResolution): void {
    const hunk = this._hunks.find((h) => h.id === hunkId);
    if (!hunk) return;

    this._resolutions.set(hunkId, resolution);
    let chosenLines: string[];

    switch (resolution) {
      case "local":
        chosenLines = hunk.localLines;
        break;
      case "remote":
        chosenLines = hunk.remoteLines;
        break;
      case "base":
        chosenLines = hunk.baseLines;
        break;
      case "both_local_first":
        chosenLines = [...hunk.localLines, ...hunk.remoteLines];
        break;
      case "both_remote_first":
        chosenLines = [...hunk.remoteLines, ...hunk.localLines];
        break;
      default:
        chosenLines = hunk.localLines;
        break;
    }

    hunk.resolvedLines = chosenLines;
    hunk.resolution = resolution;

    // mergedContent を再構成
    this.rebuildMergedContent();
    this._isDirty = true;
    this._statusMessage = `競合 ${hunkId} を「${resolution}」で解決しました`;
    this.notify(this);
  }

  resolveAll(resolution: "local" | "remote"): void {
    for (const h of this._hunks) {
      if (h.type === "conflict") {
        this.resolveHunk(h.id, resolution);
      }
    }
    this._statusMessage = `すべての競合を「${resolution}」で一括解決しました`;
    this.notify(this);
  }

  private rebuildMergedContent(): void {
    const lines: string[] = [];
    for (const h of this._hunks) {
      lines.push(...h.resolvedLines);
    }
    const eol = this._session?.files.left.content.includes("\r\n")
      ? "\r\n"
      : "\n";
    this._mergedContent = lines.join(eol);
  }

  setMode(mode: NavigationMode): void {
    if (this._mode === mode) return;
    this._mode = mode;
    this.notify(this);
  }

  setStatusMessage(msg: string): void {
    if (this._statusMessage === msg) return;
    this._statusMessage = msg;
    this.notify(this);
  }

  setSaveStatus(status: SaveStatus): void {
    this._saveStatus = status;
    if (status.status === "saved") {
      this._isDirty = false;
    }
    this.notify(this);
  }
}
