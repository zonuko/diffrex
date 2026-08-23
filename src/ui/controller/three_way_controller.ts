/**
 * ThreeWayController (Smalltalk-80 スタイル Controller for 3-Way Merge)
 *
 * ユーザー入力（キーバインド、ボタン操作）と WebSocket IPC を処理し、
 * ThreeWaySessionModel のドメインメソッドを呼び出す。
 */

import type { ThreeWaySessionModel } from "../model/three_way_session_model.ts";
import type { ConflictResolution } from "../../core/types.ts";
import type {
  BackendToUiMessage,
  UiToBackendMessage,
} from "../../desktop/ipc.ts";

export interface ThreeWayControllerOptions {
  wsUrl?: string;
  sendMessage?: (msg: UiToBackendMessage) => void;
}

export class ThreeWayController {
  private model: ThreeWaySessionModel;
  private ws: WebSocket | null = null;
  private customSend?: (msg: UiToBackendMessage) => void;

  constructor(
    model: ThreeWaySessionModel,
    options?: ThreeWayControllerOptions,
  ) {
    this.model = model;
    this.customSend = options?.sendMessage;

    if (options?.wsUrl) {
      this.initWebSocket(options.wsUrl);
    }
  }

  private initWebSocket(url: string): void {
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.model.setConnectionStatus("connected");
        this.send({ type: "ui:ready" });
      };

      this.ws.onclose = () => {
        this.model.setConnectionStatus("disconnected");
      };

      this.ws.onerror = () => {
        this.model.setConnectionStatus("disconnected");
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: BackendToUiMessage = JSON.parse(event.data);
          this.handleBackendMessage(msg);
        } catch (e) {
          console.error("Failed to parse backend message:", e);
        }
      };
    } catch (e) {
      console.error("Failed to init WebSocket:", e);
      this.model.setConnectionStatus("disconnected");
    }
  }

  private send(msg: UiToBackendMessage): void {
    if (this.customSend) {
      this.customSend(msg);
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public handleBackendMessage(msg: BackendToUiMessage): void {
    switch (msg.type) {
      case "session:init":
        if (msg.data.mode === "3way") {
          this.model.setSession(msg.data);
        }
        break;

      case "save:result":
        if (msg.success) {
          this.model.setSaveStatus({
            status: "saved",
            message: msg.message,
          });
          this.model.setStatusMessage(msg.message ?? "保存しました");
        } else {
          this.model.setSaveStatus({
            status: "error",
            message: msg.message,
          });
          this.model.setStatusMessage(`保存エラー: ${msg.message ?? ""}`);
        }
        break;
    }
  }

  public resolveHunk(hunkId: string, resolution: ConflictResolution): void {
    this.model.resolveHunk(hunkId, resolution);
  }

  public resolveActiveHunk(resolution: ConflictResolution): void {
    const active = this.model.activeHunk;
    if (active) {
      this.model.resolveHunk(active.id, resolution);
    }
  }

  public resolveAll(resolution: "local" | "remote"): void {
    this.model.resolveAll(resolution);
  }

  public nextConflict(): void {
    this.model.goToNextConflict();
  }

  public prevConflict(): void {
    this.model.goToPrevConflict();
  }

  public save(): void {
    const session = this.model.session;
    if (!session) return;

    this.model.setSaveStatus({ status: "saving" });
    this.model.setStatusMessage("保存中...");

    this.send({
      type: "save:request",
      content: this.model.mergedContent,
    });
  }

  public saveAndExit(): void {
    this.save();
    // 少し待機後に終了リクエスト
    setTimeout(() => {
      const exitCode = this.model.remainingConflictsCount > 0 ? 1 : 0;
      this.send({
        type: "exit:request",
        code: exitCode,
      });
    }, 150);
  }

  public cancelAndExit(): void {
    this.send({
      type: "exit:request",
      code: 1, // 未解決・キャンセル時は非0
    });
  }

  public handleKeyDown(e: KeyboardEvent): boolean {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // 保存 (Ctrl+S)
    if (isCtrlOrCmd && e.key.toLowerCase() === "s") {
      e.preventDefault();
      this.save();
      return true;
    }

    // 保存して終了 (Ctrl+Enter)
    if (isCtrlOrCmd && e.key === "Enter") {
      e.preventDefault();
      this.saveAndExit();
      return true;
    }

    // ナビゲーションモード専用ショートカット
    if (this.model.mode === "navigation") {
      if (
        e.key === "j" || e.key === "J" || (e.altKey && e.key === "ArrowDown")
      ) {
        e.preventDefault();
        this.nextConflict();
        return true;
      }
      if (e.key === "k" || e.key === "K" || (e.altKey && e.key === "ArrowUp")) {
        e.preventDefault();
        this.prevConflict();
        return true;
      }
      // Local を採用 (1 または l)
      if (e.key === "1" || e.key.toLowerCase() === "l") {
        e.preventDefault();
        this.resolveActiveHunk("local");
        return true;
      }
      // Remote を採用 (2 または r)
      if (e.key === "2" || e.key.toLowerCase() === "r") {
        e.preventDefault();
        this.resolveActiveHunk("remote");
        return true;
      }
      // Base を採用 (3 または b)
      if (e.key === "3" || e.key.toLowerCase() === "b") {
        e.preventDefault();
        this.resolveActiveHunk("base");
        return true;
      }
    }

    return false;
  }
}
