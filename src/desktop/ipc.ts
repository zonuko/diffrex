/**
 * backend ⇄ UI 間の IPC メッセージ定義およびハンドラ（P1-10, B1-05）。
 */

import type {
  DiffSessionData,
  DirectoryDiffSessionData,
} from "../core/types.ts";

/** Backend → UI メッセージ */
export type BackendToUiMessage =
  | { type: "session:init"; data: DiffSessionData }
  | { type: "dir:tree_data"; data: DirectoryDiffSessionData }
  | {
    type: "file:diff_data";
    relativePath: string;
    data: DiffSessionData | null;
    error?: string;
  }
  | {
    type: "save:result";
    success: boolean;
    message?: string;
    relativePath?: string;
  }
  | {
    type: "dialog:result";
    path: string | null;
    targetField: "base" | "target";
  };

/** UI → Backend メッセージ */
export type UiToBackendMessage =
  | { type: "ui:ready" }
  | { type: "save:request"; content: string }
  | { type: "save:file_request"; relativePath: string; content: string }
  | { type: "file:diff_request"; relativePath: string }
  | {
    type: "dialog:open";
    dialogType: "file" | "dir";
    targetField: "base" | "target";
  }
  | {
    type: "dir:start_session";
    baseDir: string;
    targetDir: string;
    readOnly?: boolean;
  }
  | {
    type: "file:start_session";
    leftPath: string;
    rightPath: string;
    readOnly?: boolean;
  }
  | { type: "exit:request"; code?: number }
  | { type: "log"; level: "info" | "warn" | "error"; message: string };

export type IpcMessage = BackendToUiMessage | UiToBackendMessage;

export interface IpcHandlers {
  onUiReady?: () => void;
  onSaveRequest?: (content: string) => Promise<void> | void;
  onSaveFileRequest?: (
    relativePath: string,
    content: string,
  ) => Promise<void> | void;
  onFileDiffRequest?: (
    relativePath: string,
  ) => Promise<DiffSessionData | null> | DiffSessionData | null;
  onDirStartSession?: (
    baseDir: string,
    targetDir: string,
    readOnly?: boolean,
  ) => Promise<void> | void;
  onFileStartSession?: (
    leftPath: string,
    rightPath: string,
    readOnly?: boolean,
  ) => Promise<void> | void;
  onExitRequest?: (code?: number) => void;
  onLog?: (level: "info" | "warn" | "error", message: string) => void;
}

/**
 * 受信した JSON メッセージをパースして型付きメッセージとして扱う。
 */
export function parseIncomingMessage(raw: string): UiToBackendMessage | null {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || typeof obj.type !== "string") {
      return null;
    }
    return obj as UiToBackendMessage;
  } catch {
    return null;
  }
}
