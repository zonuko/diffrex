/**
 * WelcomeView (B1-06, B6-02, B6-03)
 *
 * 引数なし起動時に表示される、比較対象（フォルダ / ファイル）の選択・開始画面。
 * ドラッグ＆ドロップ対応、比較履歴一覧、セッション復元機能を含む。
 */

import { useState } from "preact/hooks";
import type { DirectoryController } from "../controller/dir_controller.ts";
import type { HistoryEntry } from "../../core/types.ts";
import { useModel } from "../hooks/use_model.ts";
import { i18n } from "../i18n/i18n_model.ts";

export interface WelcomeViewProps {
  controller: DirectoryController;
}

export function WelcomeView({ controller }: WelcomeViewProps) {
  useModel(i18n);

  const [tab, setTab] = useState<"dir" | "file" | "git">("dir");
  const [basePath, setBasePath] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [gitRepoPath, setGitRepoPath] = useState("");
  const [gitBranch, setGitBranch] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOverZone, setDragOverZone] = useState<
    "base" | "target" | "card" | null
  >(null);

  const history = controller.model.history;
  const lastSession = controller.model.lastSession;

  const handleStart = () => {
    if (tab === "git") {
      if (!gitRepoPath.trim()) {
        setErrorMsg(i18n.t("welcome.errors.specifyGit"));
        return;
      }
      setErrorMsg("");
      controller.startGitSession(gitRepoPath.trim(), {
        branch: gitBranch.trim() || undefined,
        readOnly,
      });
      return;
    }

    if (!basePath.trim() || !targetPath.trim()) {
      setErrorMsg(i18n.t("welcome.errors.specifyBoth"));
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
    if (tab === "git") {
      controller.openDialog("dir", "base", (selected) => {
        setGitRepoPath(selected);
      });
      return;
    }
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
      if (item.leftPath === item.rightPath) {
        controller.startGitSession(item.leftPath, { readOnly: item.readOnly });
      } else {
        controller.startDirectorySession(
          item.leftPath,
          item.rightPath,
          item.readOnly,
        );
      }
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
            <div class="welcome-logo">
              <img
                src="/icon.svg"
                class="welcome-app-icon"
                alt="Diffrex"
                width="48"
                height="48"
              />
              <span>Diffrex</span>
            </div>
            <p class="welcome-subtitle">{i18n.t("welcome.tagline")}</p>
          </div>

          {/* 前回のセッション復元バナー (B6-03) */}
          {lastSession && (
            <div class="welcome-restore-banner">
              <div class="welcome-restore-info">
                <span class="welcome-restore-title">
                  ⏮️ {i18n.t("welcome.restoreLastSession")}
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
                {i18n.t("welcome.restoreLastSession")}
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
              {i18n.t("welcome.tabDir")}
            </button>
            <button
              type="button"
              class={`welcome-tab ${tab === "file" ? "active" : ""}`}
              onClick={() => {
                setTab("file");
                setErrorMsg("");
              }}
            >
              {i18n.t("welcome.tabFile")}
            </button>
            <button
              type="button"
              class={`welcome-tab ${tab === "git" ? "active" : ""}`}
              onClick={() => {
                setTab("git");
                setErrorMsg("");
              }}
            >
              {i18n.t("welcome.tabGit")}
            </button>
          </div>

          <div class="welcome-form">
            {tab === "git"
              ? (
                <>
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
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverZone(null);
                      const files = e.dataTransfer?.files;
                      if (files && files.length > 0) {
                        const file = files[0] as File & { path?: string };
                        if (file.path) setGitRepoPath(file.path);
                      }
                    }}
                  >
                    <label class="welcome-label">
                      {i18n.t("welcome.gitRepo")}
                      <span class="welcome-drop-hint">
                        {` (${i18n.t("welcome.dragDropHint")})`}
                      </span>
                    </label>
                    <div class="welcome-input-row">
                      <input
                        type="text"
                        class="welcome-input"
                        placeholder="C:/path/to/git_repository"
                        value={gitRepoPath}
                        onInput={(e) =>
                          setGitRepoPath((e.target as HTMLInputElement).value)}
                      />
                      <button
                        type="button"
                        class="welcome-browse-btn"
                        onClick={() => handleBrowse("base")}
                      >
                        📁 {i18n.t("welcome.browse")}
                      </button>
                    </div>
                  </div>

                  <div class="welcome-form-group">
                    <label class="welcome-label">
                      {i18n.t("welcome.branchOptional")}
                    </label>
                    <div class="welcome-input-row">
                      <input
                        type="text"
                        class="welcome-input"
                        placeholder="main / feature-branch"
                        value={gitBranch}
                        onInput={(e) =>
                          setGitBranch((e.target as HTMLInputElement).value)}
                      />
                    </div>
                  </div>
                </>
              )
              : (
                <>
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
                        ? i18n.t("welcome.baseFolder")
                        : i18n.t("welcome.baseFile")}
                      <span class="welcome-drop-hint">
                        {` (${i18n.t("welcome.dragDropHint")})`}
                      </span>
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
                        {tab === "dir"
                          ? `📁 ${i18n.t("welcome.browse")}`
                          : `📄 ${i18n.t("welcome.browse")}`}
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
                        ? i18n.t("welcome.targetFolder")
                        : i18n.t("welcome.targetFile")}
                      <span class="welcome-drop-hint">
                        {` (${i18n.t("welcome.dragDropHint")})`}
                      </span>
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
                        {tab === "dir"
                          ? `📁 ${i18n.t("welcome.browse")}`
                          : `📄 ${i18n.t("welcome.browse")}`}
                      </button>
                    </div>
                  </div>
                </>
              )}

            <div class="welcome-options">
              <label class="welcome-checkbox-label">
                <input
                  type="checkbox"
                  checked={readOnly}
                  onChange={(e) =>
                    setReadOnly((e.target as HTMLInputElement).checked)}
                />
                <span>{i18n.t("welcome.readOnlyMode")}</span>
              </label>
            </div>

            {errorMsg && <div class="welcome-error">{errorMsg}</div>}

            <button
              type="button"
              class="welcome-submit-btn"
              onClick={handleStart}
            >
              {i18n.t("welcome.startDiff")}
            </button>

            <div class="welcome-dropzone-notice">
              <span>
                💡 {i18n.t("welcome.dragDropHint")}
              </span>
            </div>
          </div>
        </div>

        {/* 比較履歴サイドパネル (B6-03) */}
        {history.length > 0 && (
          <div class="welcome-history-card">
            <div class="welcome-history-header">
              <h3>🕒 {i18n.t("welcome.recentSessions")}</h3>
              <button
                type="button"
                class="welcome-clear-history-btn"
                title={i18n.t("welcome.clearAll")}
                onClick={() => controller.clearHistory()}
              >
                {i18n.t("welcome.clearAll")}
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
                      <span
                        class={`welcome-mode-badge ${
                          item.mode === "directory" &&
                            item.leftPath === item.rightPath
                            ? "git"
                            : item.mode
                        }`}
                      >
                        {item.mode === "directory"
                          ? (item.leftPath === item.rightPath
                            ? "🌿 GIT"
                            : "📁 DIR")
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
                      title={item.leftPath === item.rightPath
                        ? `${item.leftPath} (HEAD vs Working Tree)`
                        : `${item.leftPath} ⇄ ${item.rightPath}`}
                    >
                      <div class="welcome-history-path">{item.leftPath}</div>
                      {item.leftPath !== item.rightPath && (
                        <>
                          <div class="welcome-history-arrow">⇄</div>
                          <div class="welcome-history-path">
                            {item.rightPath}
                          </div>
                        </>
                      )}
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
