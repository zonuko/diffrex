/**
 * Deno Desktop ウィンドウおよび UI エンドポイントの管理（P1-09, P1-12, B1-05）。
 */

import { basename, join } from "@std/path";
import { compareDirectories } from "../core/dir_diff.ts";
import {
  type FileMetadata,
  readFileTarget,
  resolveSavePath,
  writeFileTarget,
} from "../core/file_io.ts";
import { buildSession, buildSessionAsync } from "../core/session.ts";
import type {
  DiffSessionData,
  DirectoryDiffSessionData,
  FileTarget,
} from "../core/types.ts";
import { openDirectoryDialog, openFileDialog } from "./dialog.ts";
import {
  clearHistory,
  loadHistory,
  loadSessionSnapshot,
  recordHistoryEntry,
  removeHistoryEntry,
  saveSessionSnapshot,
} from "../core/history.ts";
import {
  type BackendToUiMessage,
  type IpcHandlers,
  parseIncomingMessage,
} from "./ipc.ts";

import indexHtml from "../ui/index.html" with { type: "text" };
import stylesCss from "../ui/styles.css" with { type: "text" };
import bundleJs from "../ui/bundle.js" with { type: "text" };

/** Deno Desktop の BrowserWindow 簡易型定義 */
interface DesktopBrowserWindow {
  setTitle(title: string): void;
  addEventListener(event: string, listener: (e: unknown) => void): void;
  close(): void;
}

interface DenoWithDesktop {
  BrowserWindow?: new () => DesktopBrowserWindow;
}

/** desktop ランタイム（`deno desktop`）で動作しているか。 */
export function isDesktopRuntime(): boolean {
  return "BrowserWindow" in Deno;
}

export type AnySessionData =
  | DiffSessionData
  | DirectoryDiffSessionData
  | { mode: "welcome" };

/**
 * 比較ファイル名・ディレクトリ名からウィンドウタイトルを生成する。
 */
export function formatWindowTitle(session: AnySessionData): string {
  if (session.mode === "welcome") {
    return "Diffrex";
  }
  if (session.mode === "directory") {
    const leftName = basename((session as DirectoryDiffSessionData).baseDir);
    const rightName = basename((session as DirectoryDiffSessionData).targetDir);
    return `Diffrex - 📁 ${leftName} ⇄ 📁 ${rightName}`;
  }
  const diffSession = session as DiffSessionData;
  const leftName = basename(diffSession.files.left.path);
  const rightName = basename(diffSession.files.right.path);
  return `Diffrex - ${leftName} ⇄ ${rightName}`;
}

export interface DesktopServerOptions {
  port?: number;
  hostname?: string;
  metadataMap?: Map<string, FileMetadata>;
  handlers?: IpcHandlers;
}

export interface DesktopServerInstance {
  server: Deno.HttpServer;
  port: number;
  url: string;
  close: () => Promise<void>;
  waitClosed: () => Promise<number>;
  broadcast: (msg: BackendToUiMessage) => void;
}

/**
 * UI 配信・IPC 通信用 HTTP / WebSocket サーバを起動する。
 */
export function startDesktopServer(
  initialSession: AnySessionData,
  options?: DesktopServerOptions,
): DesktopServerInstance {
  let currentSession: AnySessionData = initialSession;
  const metadataMap = options?.metadataMap ?? new Map<string, FileMetadata>();
  const activeSockets = new Set<WebSocket>();
  let hasResolvedExit = false;
  let exitCode = 0;
  let resolveExit: ((code: number) => void) | null = null;
  const exitPromise = new Promise<number>((resolve) => {
    resolveExit = (code: number) => {
      if (!hasResolvedExit) {
        hasResolvedExit = true;
        exitCode = code;
        resolve(code);
      }
    };
  });

  let desktopWindow: DesktopBrowserWindow | null = null;

  const sendToSocket = (ws: WebSocket, msg: BackendToUiMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  const broadcast = (msg: BackendToUiMessage) => {
    for (const ws of activeSockets) {
      sendToSocket(ws, msg);
    }
  };

  // 静的アセット読み込みヘルパー
  const loadAsset = (relativeUrl: string, fallback: string): string => {
    try {
      const assetUrl = new URL(relativeUrl, import.meta.url);
      return Deno.readTextFileSync(assetUrl);
    } catch {
      return fallback;
    }
  };

  const handler = (req: Request): Response => {
    const url = new URL(req.url);

    // WebSocket アップグレード (/ws)
    if (url.pathname === "/ws") {
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket Upgrade", { status: 400 });
      }

      const { socket, response } = Deno.upgradeWebSocket(req);

      socket.onopen = () => {
        activeSockets.add(socket);
      };

      socket.onmessage = async (event) => {
        const parsed = parseIncomingMessage(String(event.data));
        if (!parsed) return;

        switch (parsed.type) {
          case "ui:ready": {
            if (currentSession.mode === "directory") {
              sendToSocket(socket, {
                type: "dir:tree_data",
                data: currentSession as DirectoryDiffSessionData,
              });
            } else if (currentSession.mode !== "welcome") {
              sendToSocket(socket, {
                type: "session:init",
                data: currentSession as DiffSessionData,
              });
            }
            options?.handlers?.onUiReady?.();
            break;
          }

          case "file:diff_request": {
            if (currentSession.mode !== "directory") {
              sendToSocket(socket, {
                type: "file:diff_data",
                relativePath: parsed.relativePath,
                data: null,
                error: "Not in directory mode",
              });
              break;
            }

            const dirSession = currentSession as DirectoryDiffSessionData;
            const leftFullPath = join(dirSession.baseDir, parsed.relativePath);
            const rightFullPath = join(
              dirSession.targetDir,
              parsed.relativePath,
            );

            try {
              const { isImageExtension } = await import(
                "../core/media/image_detector.ts"
              );
              const isImage = isImageExtension(leftFullPath) ||
                isImageExtension(rightFullPath);

              let diffSession: DiffSessionData;

              if (isImage) {
                const { readImageTarget } = await import("../core/file_io.ts");
                let leftImg: import("../core/types.ts").ImageTarget;
                let rightImg: import("../core/types.ts").ImageTarget;

                try {
                  leftImg = await readImageTarget(leftFullPath);
                } catch {
                  leftImg = {
                    path: leftFullPath,
                    dataUrl: "",
                    mimeType: "image/png",
                    sizeBytes: 0,
                  };
                }

                try {
                  rightImg = await readImageTarget(rightFullPath);
                } catch {
                  rightImg = {
                    path: rightFullPath,
                    dataUrl: "",
                    mimeType: "image/png",
                    sizeBytes: 0,
                  };
                }

                diffSession = buildSession({
                  args: {
                    mode: "2way",
                    positional: [leftFullPath, rightFullPath],
                    left: leftFullPath,
                    right: rightFullPath,
                    wait: false,
                    readOnly: dirSession.readOnly,
                    ignoreSpace: false,
                    ignoreComments: false,
                    help: false,
                    version: false,
                    prompt: dirSession.aiContext?.prompt,
                    agent: dirSession.aiContext?.agent,
                    model: dirSession.aiContext?.model,
                  },
                  left: { path: leftFullPath, content: "", readOnly: true },
                  right: {
                    path: rightFullPath,
                    content: "",
                    readOnly: dirSession.readOnly,
                  },
                  imageSession: {
                    sessionId: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    mode: "image",
                    left: leftImg,
                    right: rightImg,
                    readOnly: dirSession.readOnly,
                  },
                });
              } else {
                let leftTarget: FileTarget;
                let rightTarget: FileTarget;

                try {
                  const res = await readFileTarget(leftFullPath, {
                    readOnly: true,
                  });
                  leftTarget = res.target;
                  metadataMap.set(leftFullPath, res.meta);
                } catch {
                  leftTarget = {
                    path: leftFullPath,
                    content: "",
                    readOnly: true,
                  };
                }

                try {
                  const res = await readFileTarget(rightFullPath, {
                    readOnly: dirSession.readOnly,
                  });
                  rightTarget = res.target;
                  metadataMap.set(rightFullPath, res.meta);
                } catch {
                  rightTarget = {
                    path: rightFullPath,
                    content: "",
                    readOnly: dirSession.readOnly,
                  };
                }

                diffSession = await buildSessionAsync({
                  args: {
                    mode: "2way",
                    positional: [leftFullPath, rightFullPath],
                    left: leftFullPath,
                    right: rightFullPath,
                    wait: false,
                    readOnly: dirSession.readOnly,
                    ignoreSpace: false,
                    ignoreComments: false,
                    help: false,
                    version: false,
                    prompt: dirSession.aiContext?.prompt,
                    agent: dirSession.aiContext?.agent,
                    model: dirSession.aiContext?.model,
                  },
                  left: leftTarget,
                  right: rightTarget,
                });
              }

              sendToSocket(socket, {
                type: "file:diff_data",
                relativePath: parsed.relativePath,
                data: diffSession,
              });
            } catch (err) {
              sendToSocket(socket, {
                type: "file:diff_data",
                relativePath: parsed.relativePath,
                data: null,
                error: err instanceof Error ? err.message : String(err),
              });
            }
            break;
          }

          case "save:file_request": {
            if (currentSession.mode !== "directory") {
              break;
            }
            const dirSession = currentSession as DirectoryDiffSessionData;
            const targetFullPath = join(
              dirSession.targetDir,
              parsed.relativePath,
            );

            if (dirSession.readOnly) {
              broadcast({
                type: "save:result",
                success: false,
                message: "読み取り専用のため保存できません",
                relativePath: parsed.relativePath,
              });
              break;
            }

            try {
              const meta = metadataMap.get(targetFullPath);
              await writeFileTarget(targetFullPath, parsed.content, meta);
              broadcast({
                type: "save:result",
                success: true,
                message: `保存しました: ${parsed.relativePath}`,
                relativePath: parsed.relativePath,
              });
            } catch (err) {
              broadcast({
                type: "save:result",
                success: false,
                message: `保存に失敗しました: ${
                  err instanceof Error ? err.message : String(err)
                }`,
                relativePath: parsed.relativePath,
              });
            }
            break;
          }

          case "dialog:open": {
            const title = parsed.dialogType === "dir"
              ? (parsed.targetField === "base"
                ? "Base フォルダを選択"
                : "Target フォルダを選択")
              : (parsed.targetField === "base"
                ? "Base ファイルを選択"
                : "Target ファイルを選択");

            const selectedPath = parsed.dialogType === "dir"
              ? await openDirectoryDialog(title)
              : await openFileDialog(title);

            sendToSocket(socket, {
              type: "dialog:result",
              path: selectedPath,
              targetField: parsed.targetField,
            });
            break;
          }

          case "dir:start_session": {
            try {
              const session = await compareDirectories(
                parsed.baseDir,
                parsed.targetDir,
                { readOnly: parsed.readOnly },
              );
              currentSession = session;
              if (desktopWindow) {
                desktopWindow.setTitle(formatWindowTitle(session));
              }
              await recordHistoryEntry({
                mode: "directory",
                leftPath: parsed.baseDir,
                rightPath: parsed.targetDir,
                readOnly: parsed.readOnly,
              });
              broadcast({
                type: "dir:tree_data",
                data: session,
              });
            } catch (err) {
              broadcast({
                type: "save:result",
                success: false,
                message: `ディレクトリ比較の開始に失敗しました: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            }
            break;
          }

          case "file:start_session": {
            try {
              const [leftRes, rightRes] = await Promise.all([
                readFileTarget(parsed.leftPath, { readOnly: parsed.readOnly }),
                readFileTarget(parsed.rightPath, {
                  readOnly: parsed.readOnly,
                }),
              ]);
              metadataMap.set(parsed.leftPath, leftRes.meta);
              metadataMap.set(parsed.rightPath, rightRes.meta);

              const session = await buildSessionAsync({
                args: {
                  mode: "2way",
                  positional: [parsed.leftPath, parsed.rightPath],
                  left: parsed.leftPath,
                  right: parsed.rightPath,
                  wait: false,
                  readOnly: parsed.readOnly ?? false,
                  ignoreSpace: false,
                  ignoreComments: false,
                  help: false,
                  version: false,
                },
                left: leftRes.target,
                right: rightRes.target,
              });
              currentSession = session;
              if (desktopWindow) {
                desktopWindow.setTitle(formatWindowTitle(session));
              }
              await recordHistoryEntry({
                mode: "2way",
                leftPath: parsed.leftPath,
                rightPath: parsed.rightPath,
                readOnly: parsed.readOnly,
                totalHunks: session.hunks.length,
              });
              broadcast({
                type: "session:init",
                data: session,
              });
            } catch (err) {
              broadcast({
                type: "save:result",
                success: false,
                message: `ファイル比較の開始に失敗しました: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            }
            break;
          }

          case "history:get": {
            const [history, lastSession] = await Promise.all([
              loadHistory(),
              loadSessionSnapshot(),
            ]);
            sendToSocket(socket, {
              type: "history:data",
              history,
              lastSession,
            });
            break;
          }

          case "history:clear": {
            await clearHistory();
            const lastSession = await loadSessionSnapshot();
            broadcast({
              type: "history:data",
              history: [],
              lastSession,
            });
            break;
          }

          case "history:remove": {
            const updated = await removeHistoryEntry(parsed.id);
            const lastSession = await loadSessionSnapshot();
            broadcast({
              type: "history:data",
              history: updated,
              lastSession,
            });
            break;
          }

          case "session:save_snapshot": {
            await saveSessionSnapshot(parsed.snapshot);
            sendToSocket(socket, {
              type: "session:snapshot_saved",
              success: true,
            });
            break;
          }

          case "session:restore_last": {
            const snapshot = await loadSessionSnapshot();
            if (!snapshot) {
              broadcast({
                type: "save:result",
                success: false,
                message: "復元可能なセッションが見つかりません。",
              });
              break;
            }

            try {
              if (snapshot.mode === "directory") {
                const session = await compareDirectories(
                  snapshot.leftPath,
                  snapshot.rightPath,
                  {
                    readOnly: snapshot.readOnly,
                    prompt: snapshot.prompt,
                    agent: snapshot.agent,
                    model: snapshot.model,
                  },
                );
                currentSession = session;
                if (desktopWindow) {
                  desktopWindow.setTitle(formatWindowTitle(session));
                }
                broadcast({
                  type: "dir:tree_data",
                  data: session,
                });
              } else {
                const [leftRes, rightRes] = await Promise.all([
                  readFileTarget(snapshot.leftPath, {
                    readOnly: snapshot.readOnly,
                  }),
                  readFileTarget(snapshot.rightPath, {
                    readOnly: snapshot.readOnly,
                  }),
                ]);
                metadataMap.set(snapshot.leftPath, leftRes.meta);
                metadataMap.set(snapshot.rightPath, rightRes.meta);

                const session = await buildSessionAsync({
                  args: {
                    mode: snapshot.mode,
                    positional: [snapshot.leftPath, snapshot.rightPath],
                    left: snapshot.leftPath,
                    right: snapshot.rightPath,
                    base: snapshot.basePath,
                    output: snapshot.outputPath,
                    wait: false,
                    readOnly: snapshot.readOnly ?? false,
                    ignoreSpace: false,
                    ignoreComments: false,
                    help: false,
                    version: false,
                    prompt: snapshot.prompt,
                    agent: snapshot.agent,
                    model: snapshot.model,
                  },
                  left: leftRes.target,
                  right: snapshot.unsavedRightContent != null
                    ? {
                      ...rightRes.target,
                      content: snapshot.unsavedRightContent,
                    }
                    : rightRes.target,
                });

                if (snapshot.hunkStatuses) {
                  for (const hunk of session.hunks) {
                    if (snapshot.hunkStatuses[hunk.id]) {
                      hunk.status = snapshot.hunkStatuses[hunk.id];
                    }
                  }
                }

                currentSession = session;
                if (desktopWindow) {
                  desktopWindow.setTitle(formatWindowTitle(session));
                }
                broadcast({
                  type: "session:init",
                  data: session,
                });
              }
            } catch (err) {
              broadcast({
                type: "save:result",
                success: false,
                message: `セッション復元に失敗しました: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            }
            break;
          }

          case "file:drop_session": {
            if (!parsed.paths || parsed.paths.length === 0) break;
            try {
              if (parsed.paths.length === 1) {
                // 1個のパスがドロップされた場合
                const p = parsed.paths[0];
                const stat = await Deno.stat(p);
                if (stat.isDirectory) {
                  // 単一フォルダの場合: 比較先選択のためディレクトリセッションを開始または参照
                  broadcast({
                    type: "dialog:result",
                    path: p,
                    targetField: "base",
                  });
                } else {
                  // 単一ファイルの場合
                  broadcast({
                    type: "dialog:result",
                    path: p,
                    targetField: "base",
                  });
                }
              } else if (parsed.paths.length >= 2) {
                const path1 = parsed.paths[0];
                const path2 = parsed.paths[1];
                const [stat1, stat2] = await Promise.all([
                  Deno.stat(path1),
                  Deno.stat(path2),
                ]);

                if (stat1.isDirectory && stat2.isDirectory) {
                  const session = await compareDirectories(path1, path2, {
                    readOnly: parsed.readOnly,
                  });
                  currentSession = session;
                  if (desktopWindow) {
                    desktopWindow.setTitle(formatWindowTitle(session));
                  }
                  await recordHistoryEntry({
                    mode: "directory",
                    leftPath: path1,
                    rightPath: path2,
                    readOnly: parsed.readOnly,
                  });
                  broadcast({
                    type: "dir:tree_data",
                    data: session,
                  });
                } else {
                  const [leftRes, rightRes] = await Promise.all([
                    readFileTarget(path1, { readOnly: parsed.readOnly }),
                    readFileTarget(path2, { readOnly: parsed.readOnly }),
                  ]);
                  metadataMap.set(path1, leftRes.meta);
                  metadataMap.set(path2, rightRes.meta);

                  const session = await buildSessionAsync({
                    args: {
                      mode: "2way",
                      positional: [path1, path2],
                      left: path1,
                      right: path2,
                      wait: false,
                      readOnly: parsed.readOnly ?? false,
                      ignoreSpace: false,
                      ignoreComments: false,
                      help: false,
                      version: false,
                    },
                    left: leftRes.target,
                    right: rightRes.target,
                  });
                  currentSession = session;
                  if (desktopWindow) {
                    desktopWindow.setTitle(formatWindowTitle(session));
                  }
                  await recordHistoryEntry({
                    mode: "2way",
                    leftPath: path1,
                    rightPath: path2,
                    readOnly: parsed.readOnly,
                    totalHunks: session.hunks.length,
                  });
                  broadcast({
                    type: "session:init",
                    data: session,
                  });
                }
              }
            } catch (err) {
              broadcast({
                type: "save:result",
                success: false,
                message: `ドロップ項目の比較開始に失敗しました: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            }
            break;
          }

          case "file:drop_content_session": {
            try {
              const session = buildSession({
                args: {
                  mode: "2way",
                  positional: [parsed.leftName, parsed.rightName],
                  left: parsed.leftName,
                  right: parsed.rightName,
                  wait: false,
                  readOnly: parsed.readOnly ?? false,
                  ignoreSpace: false,
                  ignoreComments: false,
                  help: false,
                  version: false,
                },
                left: {
                  path: parsed.leftName,
                  content: parsed.leftContent,
                  readOnly: parsed.readOnly ?? false,
                },
                right: {
                  path: parsed.rightName,
                  content: parsed.rightContent,
                  readOnly: parsed.readOnly ?? false,
                },
              });
              currentSession = session;
              if (desktopWindow) {
                desktopWindow.setTitle(formatWindowTitle(session));
              }
              broadcast({
                type: "session:init",
                data: session,
              });
            } catch (err) {
              broadcast({
                type: "save:result",
                success: false,
                message: `コンテンツ比較の開始に失敗しました: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            }
            break;
          }

          case "save:request": {
            if (options?.handlers?.onSaveRequest) {
              await options.handlers.onSaveRequest(parsed.content);
            } else if (
              currentSession.mode === "2way" ||
              currentSession.mode === "3way"
            ) {
              const session = currentSession as DiffSessionData;
              const savePath = resolveSavePath(session);
              const isReadOnly = session.mode === "3way"
                ? (session.files.right.readOnly && !session.outputPath)
                : session.files.right.readOnly;

              if (isReadOnly || savePath === "<stdin>") {
                broadcast({
                  type: "save:result",
                  success: false,
                  message: "読み取り専用のため保存できません",
                });
              } else {
                try {
                  const meta = metadataMap.get(savePath) ??
                    metadataMap.get(session.files.right.path) ??
                    metadataMap.get(session.files.left.path);
                  await writeFileTarget(savePath, parsed.content, meta);
                  broadcast({
                    type: "save:result",
                    success: true,
                    message: `保存しました: ${savePath}`,
                  });
                } catch (err) {
                  broadcast({
                    type: "save:result",
                    success: false,
                    message: `保存に失敗しました: ${
                      err instanceof Error ? err.message : String(err)
                    }`,
                  });
                }
              }
            }
            break;
          }

          case "exit:request": {
            const targetCode = parsed.code ?? 0;
            options?.handlers?.onExitRequest?.(targetCode);
            resolveExit?.(targetCode);
            if (desktopWindow) {
              try {
                desktopWindow.close();
              } catch {
                // ignore
              }
            }
            break;
          }

          case "log": {
            options?.handlers?.onLog?.(parsed.level, parsed.message);
            break;
          }
        }
      };

      socket.onclose = () => {
        activeSockets.delete(socket);
      };

      socket.onerror = () => {
        activeSockets.delete(socket);
      };

      return response;
    }

    // JSON セッションデータ取得 API (/api/session)
    if (url.pathname === "/api/session") {
      return new Response(JSON.stringify(currentSession), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // UI HTML 配信 (/, /index.html)
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = loadAsset("../ui/index.html", indexHtml);
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // CSS スタイルシート配信 (/styles.css)
    if (url.pathname === "/styles.css") {
      const css = loadAsset("../ui/styles.css", stylesCss);
      return new Response(css, {
        headers: {
          "content-type": "text/css; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // UI バンドル JS 配信 (/bundle.js)
    if (url.pathname === "/bundle.js") {
      const js = loadAsset("../ui/bundle.js", bundleJs);
      return new Response(js, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  };

  let server: Deno.HttpServer;
  if (isDesktopRuntime()) {
    server = Deno.serve(handler);
  } else {
    server = Deno.serve(
      {
        port: options?.port ?? 0,
        hostname: options?.hostname ?? "127.0.0.1",
        onListen: () => {},
      },
      handler,
    );
  }

  const address = server.addr as Deno.NetAddr;
  const port = address.port;
  const serverUrl = `http://${address.hostname}:${port}`;

  console.log(`Diffrex: UI server running at ${serverUrl}`);

  // Deno Desktop ランタイム下でのウィンドウ初期化
  if (isDesktopRuntime()) {
    const desktop = Deno as unknown as DenoWithDesktop;
    if (desktop.BrowserWindow) {
      try {
        const title = formatWindowTitle(currentSession);
        const win = new desktop.BrowserWindow();
        desktopWindow = win;
        win.setTitle(title);
        win.addEventListener("close", () => {
          resolveExit?.(1);
        });
      } catch (err) {
        console.warn("Failed to initialize BrowserWindow:", err);
      }
    }
  }

  const close = async () => {
    for (const ws of activeSockets) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    activeSockets.clear();
    await server.shutdown();
    if (!hasResolvedExit) {
      resolveExit?.(exitCode);
    }
  };

  const waitClosed = async (): Promise<number> => {
    return await exitPromise;
  };

  return {
    server,
    port,
    url: serverUrl,
    close,
    waitClosed,
    broadcast,
  };
}
