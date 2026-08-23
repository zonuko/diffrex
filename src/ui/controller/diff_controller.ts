/**
 * DiffController (Smalltalk-80 スタイル Controller)
 *
 * ユーザー入力（キーイベント、クリック）およびバックエンド IPC メッセージを解釈し、
 * Model の状態更新やエディタ（MergeView）へのコマンド発行を統括する。
 */

import type { Chunk, MergeView } from "@codemirror/merge";
import type { DiffSessionModel } from "../model/diff_session_model.ts";
import type {
  BackendToUiMessage,
  UiToBackendMessage,
} from "../../desktop/ipc.ts";
import type { DiffSessionData } from "../../core/types.ts";

export class DiffController {
  private model: DiffSessionModel;
  private mergeView: MergeView | null = null;
  private ws: WebSocket | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingExit: boolean = false;
  private pendingExitCode: number = 0;

  constructor(model: DiffSessionModel) {
    this.model = model;
  }

  // --- MergeView ライフサイクル ---

  /**
   * CodeMirror MergeView インスタンスをアタッチする。
   */
  attachMergeView(mergeView: MergeView | null): void {
    this.mergeView = mergeView;
  }

  getMergeView(): MergeView | null {
    return this.mergeView;
  }

  // --- 差分 / Hunk 操作 ---

  /**
   * CodeMirror からの差分 Chunks 更新を処理する。
   */
  handleChunksUpdated(
    chunks: readonly Chunk[],
    newActiveIndex?: number,
  ): void {
    this.model.setChunks(chunks, newActiveIndex);
  }

  /**
   * カーソル移動やクリックによる Hunk 選択を処理する。
   */
  handleCursorChunkSelect(chunkIndex: number): void {
    this.model.setActiveChunkIndex(chunkIndex);
  }

  /**
   * エディタ内容変更時の処理（Dirty フラグ設定、edited ステータス更新、Chunks 同期）。
   */
  handleDocumentChanged(): void {
    this.model.setDirty(true);
    this.model.markCurrentHunkEdited();
    if (this.mergeView) {
      const updatedChunks = this.mergeView.chunks;
      const currentActive = this.model.activeChunkIndex;
      const newIndex = updatedChunks.length > 0
        ? Math.min(Math.max(0, currentActive), updatedChunks.length - 1)
        : -1;
      this.model.setChunks(updatedChunks, newIndex);
    }
  }

  /**
   * 次の Hunk へ移動する。
   */
  nextHunk(): void {
    this.model.selectNextHunk();
  }

  /**
   * 前の Hunk へ移動する。
   */
  prevHunk(): void {
    this.model.selectPrevHunk();
  }

  /**
   * 現在の Hunk を承認 (accepted) にし、次の未レビュー Hunk へ進める (P4-12)。
   */
  acceptHunk(): void {
    this.model.acceptCurrentHunk();
  }

  /**
   * 現在の Hunk を拒否 (rejected) にし、Target（右側）の変更を破棄して Base の内容に戻す (P4-13)。
   */
  rejectHunk(): void {
    if (this.mergeView) {
      const chunk = this.model.activeChunk;
      if (chunk) {
        this.model.setDirty(true);
        const baseText = this.mergeView.a.state.sliceDoc(
          chunk.fromA,
          chunk.toA,
        );
        this.mergeView.b.dispatch({
          changes: { from: chunk.fromB, to: chunk.toB, insert: baseText },
        });
        this.syncChunksAfterMerge();
      }
    }
    this.model.rejectCurrentHunk();
  }

  /**
   * 編集モードに入り、対象 Hunk またはエディタにフォーカスする。
   */
  enterEditMode(): void {
    this.model.setMode("editing");
    if (!this.mergeView) return;

    const chunk = this.model.activeChunk;
    this.mergeView.b.focus();
    if (chunk) {
      this.mergeView.b.dispatch({
        selection: { anchor: chunk.fromB, head: chunk.fromB },
      });
    }
  }

  /**
   * 編集モードを終了し、ナビゲーションモードに戻る。
   */
  exitEditMode(): void {
    this.model.setMode("navigation");
    if (typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur();
    }
    const g = globalThis as unknown as { focus?: () => void };
    if (typeof g.focus === "function") {
      g.focus();
    }
  }

  /**
   * ブロックマージ (Base -> Target / 左 -> 右) を実行する。
   */
  mergeLeftToRight(): void {
    if (!this.mergeView) return;
    const chunk = this.model.activeChunk;
    if (!chunk) return;

    this.model.setDirty(true);
    const baseText = this.mergeView.a.state.sliceDoc(chunk.fromA, chunk.toA);
    this.mergeView.b.dispatch({
      changes: { from: chunk.fromB, to: chunk.toB, insert: baseText },
    });

    this.syncChunksAfterMerge();
  }

  /**
   * ブロックマージ (Target -> Base / 右 -> 左) を実行する。
   */
  mergeRightToLeft(): void {
    if (!this.mergeView) return;
    const chunk = this.model.activeChunk;
    if (!chunk) return;

    this.model.setDirty(true);
    const targetText = this.mergeView.b.state.sliceDoc(chunk.fromB, chunk.toB);
    this.mergeView.a.dispatch({
      changes: { from: chunk.fromA, to: chunk.toA, insert: targetText },
    });

    this.syncChunksAfterMerge();
  }

  /**
   * マージ実行後に CodeMirror の最新 chunks を取得して Model に同期する。
   */
  private syncChunksAfterMerge(): void {
    setTimeout(() => {
      if (!this.mergeView) return;
      const updatedChunks = this.mergeView.chunks;
      const currentActive = this.model.activeChunkIndex;
      const newIndex = updatedChunks.length > 0
        ? Math.min(currentActive, updatedChunks.length - 1)
        : -1;
      this.model.setChunks(updatedChunks, newIndex);
    }, 10);
  }

  /**
   * ノイズ hunk の一括折りたたみ/展開を切り替える。
   */
  toggleNoiseFolded(): void {
    this.model.toggleNoiseFolded();
  }

  /**
   * 個別 hunk の折りたたみ/展開を切り替える。
   */
  toggleHunkFold(hunkId: string): void {
    this.model.toggleHunkFold(hunkId);
  }

  // --- キーボード入力ハンドリング ---

  /**
   * グローバルキーダウンイベントを解釈して適切な操作を実行する。
   */
  handleKeyDown(e: KeyboardEvent): void {
    const isEditorFocused = typeof document !== "undefined" &&
      Boolean(
        document.activeElement &&
          (document.activeElement.closest?.(".cm-editor") ||
            document.activeElement.classList?.contains("cm-content")),
      );

    const key = e.key;
    const isAlt = e.altKey;
    const isCtrl = e.ctrlKey || e.metaKey;

    // 1. ナビゲーション: 次の Hunk (Alt+Down, または 非フォーカス時の J / Down)
    if (
      (isAlt && key === "ArrowDown") ||
      (!isEditorFocused && !isCtrl && !isAlt && (key === "j" || key === "J"))
    ) {
      e.preventDefault();
      this.nextHunk();
      return;
    }

    // 2. ナビゲーション: 前の Hunk (Alt+Up, または 非フォーカス時の K / Up)
    if (
      (isAlt && key === "ArrowUp") ||
      (!isEditorFocused && !isCtrl && !isAlt && (key === "k" || key === "K"))
    ) {
      e.preventDefault();
      this.prevHunk();
      return;
    }

    // 3. レビュー承認: A (P4-12)
    if (!isEditorFocused && !isCtrl && !isAlt && (key === "a" || key === "A")) {
      e.preventDefault();
      this.acceptHunk();
      return;
    }

    // 4. レビュー拒否: R (P4-13)
    if (!isEditorFocused && !isCtrl && !isAlt && (key === "r" || key === "R")) {
      e.preventDefault();
      this.rejectHunk();
      return;
    }

    // 5. 編集モードへの遷移: 非フォーカス時の Enter または E (P4-14)
    if (
      !isEditorFocused && !isCtrl && !isAlt &&
      (key === "Enter" || key === "e" || key === "E")
    ) {
      e.preventDefault();
      this.enterEditMode();
      return;
    }

    // 6. ナビゲーションモードへの遷移: Escape
    if (key === "Escape") {
      e.preventDefault();
      this.exitEditMode();
      return;
    }

    // 7. ブロックマージ (Base -> Target / 左 -> 右): Ctrl+R または Alt+Right
    if (
      (isCtrl && !isAlt && (key === "r" || key === "R")) ||
      (isAlt && !isCtrl && key === "ArrowRight")
    ) {
      e.preventDefault();
      this.mergeLeftToRight();
      return;
    }

    // 8. ブロックマージ (Target -> Base / 右 -> 左): Ctrl+L または Alt+Left
    if (
      (isCtrl && !isAlt && (key === "l" || key === "L")) ||
      (isAlt && !isCtrl && key === "ArrowLeft")
    ) {
      e.preventDefault();
      this.mergeRightToLeft();
      return;
    }

    // 9. ノイズ hunk の折りたたみ切り替え: Ctrl+N / Cmd+N (P4-09)
    if (isCtrl && !isAlt && (key === "n" || key === "N")) {
      e.preventDefault();
      this.toggleNoiseFolded();
      return;
    }

    // 10. 保存して終了: Ctrl+Enter / Cmd+Enter (P3-07)
    if (isCtrl && !isAlt && key === "Enter") {
      e.preventDefault();
      this.saveAndExit();
      return;
    }

    // 11. 保存: Ctrl+S / Cmd+S (P3-01)
    if (isCtrl && !isAlt && (key === "s" || key === "S")) {
      e.preventDefault();
      this.requestSave();
      return;
    }
  }

  // --- IPC / 通信管理 ---

  /**
   * WebSocket / HTTP 通信をセットアップする。
   */
  connectWebSocket(wsUrl?: string): () => void {
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/session");
        if (res.ok) {
          const data: DiffSessionData = await res.json();
          this.model.setSession(data);
          this.model.setConnectionStatus("connected");
        }
      } catch (err) {
        console.warn("fetchSession failed:", err);
      }
    };

    const defaultWsUrl = `${
      location.protocol === "https:" ? "wss:" : "ws:"
    }//${location.host}/ws`;
    const targetUrl = wsUrl || defaultWsUrl;

    try {
      this.ws = new WebSocket(targetUrl);

      this.ws.onopen = () => {
        this.model.setConnectionStatus("connected");
        this.sendIpcMessage({ type: "ui:ready" });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as BackendToUiMessage;
          this.handleIpcMessage(msg);
        } catch (err) {
          console.error("Failed to parse incoming WS message:", err);
        }
      };

      this.ws.onclose = () => {
        this.model.setConnectionStatus("disconnected");
      };

      this.ws.onerror = () => {
        this.fallbackTimer = setTimeout(() => {
          fetchSession();
        }, 500);
      };
    } catch {
      fetchSession();
    }

    // 未保存変更がある場合のブラウザ確認ダイアログリスナ (P3-08)
    const beforeUnloadListener = (e: BeforeUnloadEvent) => {
      if (this.model.isDirty) {
        e.preventDefault();
        e.returnValue = "未保存の変更があります。破棄して終了しますか？";
        return "未保存の変更があります。破棄して終了しますか？";
      }
    };

    const pageHideListener = () => {
      if (this.model.isDirty) {
        this.sendIpcMessage({ type: "exit:request", code: 1 });
      }
    };

    if (typeof globalThis.addEventListener === "function") {
      globalThis.addEventListener("beforeunload", beforeUnloadListener);
      globalThis.addEventListener("pagehide", pageHideListener);
    }

    return () => {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      if (this.fallbackTimer) {
        clearTimeout(this.fallbackTimer);
        this.fallbackTimer = null;
      }
      if (typeof globalThis.removeEventListener === "function") {
        globalThis.removeEventListener("beforeunload", beforeUnloadListener);
        globalThis.removeEventListener("pagehide", pageHideListener);
      }
    };
  }

  /**
   * バックエンドからの IPC メッセージを処理する。
   */
  handleIpcMessage(msg: BackendToUiMessage): void {
    if (msg.type === "session:init") {
      this.model.setSession(msg.data);
    } else if (msg.type === "save:result") {
      this.model.setSaveStatus({
        status: msg.success ? "saved" : "error",
        message: msg.message,
      });
      if (msg.message) {
        this.model.setStatusMessage(msg.message);
      }

      if (this.pendingExit) {
        if (msg.success) {
          const code = this.pendingExitCode;
          this.pendingExit = false;
          this.requestExit(code);
          if (typeof document !== "undefined") {
            const g = globalThis as unknown as { close?: () => void };
            if (typeof g.close === "function") {
              try {
                g.close();
              } catch {
                // ignore
              }
            }
          }
        } else {
          this.pendingExit = false;
        }
      }
    }
  }

  /**
   * UI からバックエンドへメッセージを送信する。
   */
  sendIpcMessage(msg: UiToBackendMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * 保存要求 (Phase 3 連携)
   */
  requestSave(): void {
    if (this.model.isReadOnly) {
      const msg = "読み取り専用のため保存できません";
      this.model.setStatusMessage(msg);
      this.model.setSaveStatus({ status: "error", message: msg });
      if (this.pendingExit) {
        this.pendingExit = false;
      }
      return;
    }
    const rightContent = this.mergeView?.b.state.doc.toString() ??
      this.model.session?.files?.right?.content ?? "";
    this.model.setSaveStatus({ status: "saving" });
    this.sendIpcMessage({ type: "save:request", content: rightContent });
  }

  /**
   * 保存して終了 (Ctrl+Enter / Cmd+Enter)
   */
  saveAndExit(): void {
    if (this.model.isReadOnly) {
      this.requestExit(0);
      if (typeof document !== "undefined") {
        const g = globalThis as unknown as { close?: () => void };
        if (typeof g.close === "function") {
          try {
            g.close();
          } catch {
            // ignore
          }
        }
      }
      return;
    }
    this.pendingExit = true;
    this.pendingExitCode = 0;
    this.requestSave();
  }

  /**
   * 終了要求
   */
  requestExit(code?: number): void {
    this.sendIpcMessage({ type: "exit:request", code });
  }
}
