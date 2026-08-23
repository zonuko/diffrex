/**
 * DirectoryController (B1-07 Smalltalk-80 MVC Controller)
 *
 * ディレクトリツリーのユーザ操作、遅延ロード IPC 通信、ファイル切り替えを調整する。
 */

import type {
  BackendToUiMessage,
  UiToBackendMessage,
} from "../../desktop/ipc.ts";
import type { DirectoryDiffModel } from "../model/dir_diff_model.ts";
import type { DiffSessionModel } from "../model/diff_session_model.ts";
import type { DiffController } from "./diff_controller.ts";

export class DirectoryController {
  private _model: DirectoryDiffModel;
  private _diffModel: DiffSessionModel;
  private _diffController: DiffController | null = null;
  private _ws: WebSocket | null = null;
  private _dialogCallbacks = new Map<string, (path: string) => void>();

  constructor(
    model: DirectoryDiffModel,
    diffModel: DiffSessionModel,
    diffController?: DiffController,
  ) {
    this._model = model;
    this._diffModel = diffModel;
    this._diffController = diffController ?? null;
  }

  get model(): DirectoryDiffModel {
    return this._model;
  }

  get diffModel(): DiffSessionModel {
    return this._diffModel;
  }

  setDiffController(diffController: DiffController): void {
    this._diffController = diffController;
  }

  connectWebSocket(url?: string): () => void {
    const wsUrl = url ||
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;

    try {
      this._ws = new WebSocket(wsUrl);

      this._ws.onopen = () => {
        this._diffModel.setConnectionStatus("connected");
        this.sendMessage({ type: "ui:ready" });
      };

      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as BackendToUiMessage;
          this.handleBackendMessage(msg);
        } catch (e) {
          console.error("Failed to parse backend message:", e);
        }
      };

      this._ws.onclose = () => {
        this._diffModel.setConnectionStatus("disconnected");
        this._ws = null;
      };

      this._ws.onerror = (err) => {
        console.error("WebSocket error:", err);
      };
    } catch (err) {
      console.error("Failed to create WebSocket:", err);
    }

    return () => {
      if (this._ws) {
        this._ws.close();
        this._ws = null;
      }
    };
  }

  handleBackendMessage(msg: BackendToUiMessage): void {
    switch (msg.type) {
      case "session:init": {
        this._diffModel.setSession(msg.data);
        break;
      }
      case "dir:tree_data": {
        this._model.setDirSession(msg.data);
        if (this._model.selectedPath) {
          this.selectFile(this._model.selectedPath);
        }
        break;
      }
      case "file:diff_data": {
        this._model.setActiveFileSession(
          msg.relativePath,
          msg.data,
          msg.error,
        );
        if (msg.data && this._model.selectedPath === msg.relativePath) {
          this._diffModel.setSession(msg.data);
        }
        break;
      }
      case "dialog:result": {
        if (msg.path) {
          const cb = this._dialogCallbacks.get(msg.targetField);
          if (cb) {
            cb(msg.path);
          }
        }
        break;
      }
      case "save:result": {
        if (msg.relativePath) {
          if (msg.success) {
            this._model.setFileDirty(msg.relativePath, false);
            this._diffModel.setSaveStatus({
              status: "saved",
              message: msg.message,
            });
            this._diffModel.setDirty(false);
          } else {
            this._diffModel.setSaveStatus({
              status: "error",
              message: msg.message,
            });
          }
        } else {
          if (msg.success) {
            this._diffModel.setSaveStatus({
              status: "saved",
              message: msg.message,
            });
            this._diffModel.setDirty(false);
          } else {
            this._diffModel.setSaveStatus({
              status: "error",
              message: msg.message,
            });
          }
        }
        break;
      }
    }
  }

  sendMessage(msg: UiToBackendMessage): void {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(msg));
    }
  }

  selectFile(relativePath: string): void {
    if (
      this._model.selectedPath === relativePath &&
      this._model.activeFileSession
    ) {
      return;
    }

    this._model.startLoadingFile(relativePath);
    this.sendMessage({
      type: "file:diff_request",
      relativePath,
    });
  }

  toggleDir(relPath: string): void {
    this._model.toggleDir(relPath);
  }

  saveCurrentFile(): void {
    const selectedPath = this._model.selectedPath;
    if (!selectedPath) return;

    const editorView = this._diffController?.getMergeView();
    const content = editorView ? editorView.b.state.doc.toString() : "";

    this._diffModel.setSaveStatus({ status: "saving" });
    this.sendMessage({
      type: "save:file_request",
      relativePath: selectedPath,
      content,
    });
  }

  openDialog(
    dialogType: "file" | "dir",
    targetField: "base" | "target",
    onSelected: (path: string) => void,
  ): void {
    this._dialogCallbacks.set(targetField, onSelected);
    this.sendMessage({
      type: "dialog:open",
      dialogType,
      targetField,
    });
  }

  startDirectorySession(
    baseDir: string,
    targetDir: string,
    readOnly?: boolean,
  ): void {
    this.sendMessage({
      type: "dir:start_session",
      baseDir,
      targetDir,
      readOnly,
    });
  }

  startFileSession(
    leftPath: string,
    rightPath: string,
    readOnly?: boolean,
  ): void {
    this.sendMessage({
      type: "file:start_session",
      leftPath,
      rightPath,
      readOnly,
    });
  }

  requestExit(code = 0): void {
    this.sendMessage({
      type: "exit:request",
      code,
    });
  }
}
