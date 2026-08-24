/**
 * WelcomeView (B1-06, B6-02, B6-03)
 *
 * 引数なし起動時に表示される、比較対象（フォルダ / ファイル）の選択・開始画面。
 * ドラッグ＆ドロップ対応、比較履歴一覧、セッション復元機能を含む。
 */

import { useState } from "preact/hooks";
import type { DirectoryController } from "../controller/dir_controller.ts";
import type { HistoryEntry } from "../../core/types.ts";

export interface WelcomeViewProps {
  controller: DirectoryController;
}

export function WelcomeView({ controller }: WelcomeViewProps) {
  const [tab, setTab] = useState<"dir" | "file">("dir");
  const [basePath, setBasePath] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOverZone, setDragOverZone] = useState<
    "base" | "target" | "card" | null
  >(null);

  const history = controller.model.history;
  const lastSession = controller.model.lastSession;

  const handleStart = () => {
    if (!basePath.trim() || !targetPath.trim()) {
      setErrorMsg("両方のパスを指定してください。");
      return;
    }
    setErrorMsg("");

    if (tab === "dir") {
      controller.startDirectorySession(
        basePath.trim(),
        targetPath.trim(),
        readOnly,
      );
    } else {
      controller.startFileSession(
        basePath.trim(),
        targetPath.trim(),
        readOnly,
      );
    }
  };

  const handleBrowse = (field: "base" | "target") => {
    controller.openDialog(tab, field, (selected) => {
      if (field === "base") {
        setBasePath(selected);
      } else {
        setTargetPath(selected);
      }
    });
  };

  // --- ドラッグ＆ドロップハンドラ ---
  const handleDropFiles = (e: DragEvent, zone: "base" | "target" | "card") => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverZone(null);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Electron/Webview等で path プロパティが取得できる場合
    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i] as File & { path?: string };
      if (file.path) {
        paths.push(file.path);
      } else if (file.name) {
        paths.push(file.name);
      }
    }

    if (zone === "base" && paths.length > 0) {
      setBasePath(paths[0]);
    } else if (zone === "target" && paths.length > 0) {
      setTargetPath(paths[0]);
    } else if (paths.length >= 2) {
      // 2つ以上ドロップされた場合
      if (files[0] && (files[0] as File & { path?: string }).path) {
        controller.startDropSession(paths, readOnly);
      } else {
        // パスが取れないブラウザ環境の場合はコンテンツ直接転送
        const reader1 = new FileReader();
        reader1.onload = () => {
          const content1 = String(reader1.result || "");
          const reader2 = new FileReader();
          reader2.onload = () => {
            const content2 = String(reader2.result || "");
            controller.startDropContentSession(
              files[0].name,
              content1,
              files[1].name,
              content2,
              readOnly,
            );
          };
          reader2.readAsText(files[1]);
        };
        reader1.readAsText(files[0]);
      }
    } else if (paths.length === 1) {
      if (!basePath) {
        setBasePath(paths[0]);
      } else {
        setTargetPath(paths[0]);
      }
    }
  };

  const handleLaunchHistory = (item: HistoryEntry) => {
    if (item.mode === "directory") {
      controller.startDirectorySession(
        item.leftPath,
        item.rightPath,
        item.readOnly,
      );
    } else {
      controller.startFileSession(
        item.leftPath,
        item.rightPath,
        item.readOnly,
      );
    }
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  return (
    <div
      class="welcome-container"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOverZone("card");
      }}
      onDragLeave={() => setDragOverZone(null)}
      onDrop={(e) => handleDropFiles(e, "card")}
    >
      <div class="welcome-layout">
        <div
          class={`welcome-card ${
            dragOverZone === "card" ? "drag-highlight" : ""
          }`}
        >
          <div class="welcome-header">
            <div class="welcome-logo">Diffrex</div>
            <p class="welcome-subtitle">AI-Friendly Diff & Merge Tool</p>
          </div>

          {/* 前回のセッション復元バナー (B6-03) */}
          {lastSession && (
            <div class="welcome-restore-banner">
              <div class="welcome-restore-info">
                <span class="welcome-restore-title">
                  ⏮️ 前回のセッションを復元
                </span>
                <span class="welcome-restore-desc">
                  {lastSession.leftPath} ⇄ {lastSession.rightPath}
                </span>
              </div>
              <button
                type="button"
                class="welcome-restore-btn"
                onClick={() => controller.restoreLastSession()}
              >
                復元して再開
              </button>
            </div>
          )}

          <div class="welcome-tabs">
            <button
              type="button"
              class={`welcome-tab ${tab === "dir" ? "active" : ""}`}
              onClick={() => {
                setTab("dir");
                setErrorMsg("");
              }}
            >
              📁 フォルダ比較
            </button>
            <button
              type="button"
              class={`welcome-tab ${tab === "file" ? "active" : ""}`}
              onClick={() => {
                setTab("file");
                setErrorMsg("");
              }}
            >
              📄 ファイル比較
            </button>
          </div>

          <div class="welcome-form">
            <div
              class={`welcome-form-group ${
                dragOverZone === "base" ? "drop-active" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverZone("base");
              }}
              onDragLeave={() => setDragOverZone(null)}
              onDrop={(e) => handleDropFiles(e, "base")}
            >
              <label class="welcome-label">
                {tab === "dir"
                  ? "Base フォルダ（変更前 / 旧）"
                  : "Base ファイル（変更前 / 旧）"}
                <span class="welcome-drop-hint">（またはここにドロップ）</span>
              </label>
              <div class="welcome-input-row">
                <input
                  type="text"
                  class="welcome-input"
                  placeholder={tab === "dir"
                    ? "C:/path/to/base_dir"
                    : "C:/path/to/base.ts"}
                  value={basePath}
                  onInput={(e) =>
                    setBasePath((e.target as HTMLInputElement).value)}
                />
                <button
                  type="button"
                  class="welcome-browse-btn"
                  onClick={() => handleBrowse("base")}
                >
                  {tab === "dir" ? "📁 参照..." : "📄 参照..."}
                </button>
              </div>
            </div>

            <div
              class={`welcome-form-group ${
                dragOverZone === "target" ? "drop-active" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverZone("target");
              }}
              onDragLeave={() => setDragOverZone(null)}
              onDrop={(e) => handleDropFiles(e, "target")}
            >
              <label class="welcome-label">
                {tab === "dir"
                  ? "Target フォルダ（変更後 / 新・編集先）"
                  : "Target ファイル（変更後 / 新・編集先）"}
                <span class="welcome-drop-hint">（またはここにドロップ）</span>
              </label>
              <div class="welcome-input-row">
                <input
                  type="text"
                  class="welcome-input"
                  placeholder={tab === "dir"
                    ? "C:/path/to/target_dir"
                    : "C:/path/to/target.ts"}
                  value={targetPath}
                  onInput={(e) =>
                    setTargetPath((e.target as HTMLInputElement).value)}
                />
                <button
                  type="button"
                  class="welcome-browse-btn"
                  onClick={() => handleBrowse("target")}
                >
                  {tab === "dir" ? "📁 参照..." : "📄 参照..."}
                </button>
              </div>
            </div>

            <div class="welcome-options">
              <label class="welcome-checkbox-label">
                <input
                  type="checkbox"
                  checked={readOnly}
                  onChange={(e) =>
                    setReadOnly((e.target as HTMLInputElement).checked)}
                />
                <span>読み取り専用（保存無効）</span>
              </label>
            </div>

            {errorMsg && <div class="welcome-error">{errorMsg}</div>}

            <button
              type="button"
              class="welcome-submit-btn"
              onClick={handleStart}
            >
              比較を開始
            </button>

            <div class="welcome-dropzone-notice">
              <span>
                💡 2つのファイルをまとめてここにドロップしても比較を開始できます
              </span>
            </div>
          </div>
        </div>

        {/* 比較履歴サイドパネル (B6-03) */}
        {history.length > 0 && (
          <div class="welcome-history-card">
            <div class="welcome-history-header">
              <h3>🕒 比較履歴</h3>
              <button
                type="button"
                class="welcome-clear-history-btn"
                title="履歴をすべて削除"
                onClick={() => controller.clearHistory()}
              >
                全消去
              </button>
            </div>

            <div class="welcome-history-list">
              {history.map((item) => (
                <div
                  key={item.id}
                  class="welcome-history-item"
                  onClick={() => handleLaunchHistory(item)}
                >
                  <div class="welcome-history-main">
                    <div class="welcome-history-tag-row">
                      <span class={`welcome-mode-badge ${item.mode}`}>
                        {item.mode === "directory"
                          ? "📁 DIR"
                          : item.mode === "3way"
                          ? "🌿 3-WAY"
                          : item.mode === "image"
                          ? "🖼️ IMG"
                          : "📄 2-WAY"}
                      </span>
                      <span class="welcome-history-time">
                        {formatTimestamp(item.timestamp)}
                      </span>
                    </div>
                    <div
                      class="welcome-history-paths"
                      title={`${item.leftPath} ⇄ ${item.rightPath}`}
                    >
                      <div class="welcome-history-path">{item.leftPath}</div>
                      <div class="welcome-history-arrow">⇄</div>
                      <div class="welcome-history-path">{item.rightPath}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="welcome-history-del-btn"
                    title="この履歴を削除"
                    onClick={(e) => {
                      e.stopPropagation();
                      controller.removeHistoryItem(item.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
