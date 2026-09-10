/**
 * OpenSessionModal (B8-03 Smalltalk-80 MVC View)
 *
 * ファイル比較・フォルダ比較・Git リポジトリ・3-Way マージを
 * メニューバーから即座に開始するためのダイアログモーダル。
 */

import { useState } from "preact/hooks";
import type { MenuModel } from "../model/menu_model.ts";
import type { DirectoryController } from "../controller/dir_controller.ts";

export interface OpenSessionModalProps {
  model: MenuModel;
  controller: DirectoryController;
}

export function OpenSessionModal({
  model,
  controller,
}: OpenSessionModalProps) {
  const [tab, setTab] = useState<"file" | "dir" | "git" | "3way">(
    model.openSessionInitialTab,
  );
  const [leftPath, setLeftPath] = useState("");
  const [rightPath, setRightPath] = useState("");
  const [basePath, setBasePath] = useState("");
  const [gitRepoPath, setGitRepoPath] = useState("");
  const [gitBranch, setGitBranch] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleClose = () => {
    model.setOpenSessionModalOpen(false);
  };

  const handleBrowse = (
    dialogType: "file" | "dir",
    field: "left" | "right" | "base" | "git",
  ) => {
    controller.openDialog(
      dialogType,
      field === "base" ? "base" : "target",
      (selected) => {
        if (field === "left") setLeftPath(selected);
        else if (field === "right") setRightPath(selected);
        else if (field === "base") setBasePath(selected);
        else if (field === "git") setGitRepoPath(selected);
      },
    );
  };

  const handleStart = () => {
    setErrorMsg("");

    if (tab === "file") {
      if (!leftPath.trim() || !rightPath.trim()) {
        setErrorMsg(
          "比較元 (Left) と比較先 (Right) の両方を指定してください。",
        );
        return;
      }
      handleClose();
      controller.startFileSession(
        leftPath.trim(),
        rightPath.trim(),
        readOnly,
      );
    } else if (tab === "dir") {
      if (!leftPath.trim() || !rightPath.trim()) {
        setErrorMsg(
          "Base フォルダと Target フォルダの両方を指定してください。",
        );
        return;
      }
      handleClose();
      controller.startDirectorySession(
        leftPath.trim(),
        rightPath.trim(),
        readOnly,
      );
    } else if (tab === "git") {
      if (!gitRepoPath.trim()) {
        setErrorMsg("Git リポジトリフォルダを指定してください。");
        return;
      }
      handleClose();
      controller.startGitSession(gitRepoPath.trim(), {
        branch: gitBranch.trim() || undefined,
        readOnly,
      });
    } else if (tab === "3way") {
      if (!leftPath.trim() || !basePath.trim() || !rightPath.trim()) {
        setErrorMsg(
          "Local, Base, Remote の 3 つすべてのファイルを指定してください。",
        );
        return;
      }
      handleClose();
      // 3-Way セッション開始 IPC または drop session
      controller.startDropSession([
        leftPath.trim(),
        basePath.trim(),
        rightPath.trim(),
      ], readOnly);
    }
  };

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div
        class="modal-card open-session-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-session-title"
      >
        <div class="modal-header">
          <h2 id="open-session-title" class="modal-title">
            📂 比較・マージ対象を開く
          </h2>
          <button
            type="button"
            class="modal-close-button"
            onClick={handleClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div class="modal-body">
          <div class="welcome-tabs open-modal-tabs">
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
              class={`welcome-tab ${tab === "git" ? "active" : ""}`}
              onClick={() => {
                setTab("git");
                setErrorMsg("");
              }}
            >
              🌿 Git 差分
            </button>
            <button
              type="button"
              class={`welcome-tab ${tab === "3way" ? "active" : ""}`}
              onClick={() => {
                setTab("3way");
                setErrorMsg("");
              }}
            >
              💥 3-Way マージ
            </button>
          </div>

          {errorMsg && (
            <div class="welcome-error-msg" role="alert">
              ⚠️ {errorMsg}
            </div>
          )}

          <div class="open-session-form">
            {tab === "git"
              ? (
                <>
                  <div class="welcome-field">
                    <label class="welcome-label">Git リポジトリフォルダ:</label>
                    <div class="welcome-input-group">
                      <input
                        type="text"
                        class="welcome-input"
                        placeholder="C:\path\to\repo"
                        value={gitRepoPath}
                        onInput={(e) =>
                          setGitRepoPath((e.target as HTMLInputElement).value)}
                      />
                      <button
                        type="button"
                        class="button secondary"
                        onClick={() => handleBrowse("dir", "git")}
                      >
                        参照...
                      </button>
                    </div>
                  </div>

                  <div class="welcome-field">
                    <label class="welcome-label">
                      比較ブランチ / コミット (省略時は HEAD):
                    </label>
                    <input
                      type="text"
                      class="welcome-input"
                      placeholder="main, HEAD~1, feature など"
                      value={gitBranch}
                      onInput={(e) =>
                        setGitBranch((e.target as HTMLInputElement).value)}
                    />
                  </div>
                </>
              )
              : tab === "3way"
              ? (
                <>
                  <div class="welcome-field">
                    <label class="welcome-label">Local (変更中ファイル):</label>
                    <div class="welcome-input-group">
                      <input
                        type="text"
                        class="welcome-input"
                        placeholder="local.ts"
                        value={leftPath}
                        onInput={(e) =>
                          setLeftPath((e.target as HTMLInputElement).value)}
                      />
                      <button
                        type="button"
                        class="button secondary"
                        onClick={() => handleBrowse("file", "left")}
                      >
                        参照...
                      </button>
                    </div>
                  </div>

                  <div class="welcome-field">
                    <label class="welcome-label">Base (共通祖先):</label>
                    <div class="welcome-input-group">
                      <input
                        type="text"
                        class="welcome-input"
                        placeholder="base.ts"
                        value={basePath}
                        onInput={(e) =>
                          setBasePath((e.target as HTMLInputElement).value)}
                      />
                      <button
                        type="button"
                        class="button secondary"
                        onClick={() => handleBrowse("file", "base")}
                      >
                        参照...
                      </button>
                    </div>
                  </div>

                  <div class="welcome-field">
                    <label class="welcome-label">Remote (マージ対象):</label>
                    <div class="welcome-input-group">
                      <input
                        type="text"
                        class="welcome-input"
                        placeholder="remote.ts"
                        value={rightPath}
                        onInput={(e) =>
                          setRightPath((e.target as HTMLInputElement).value)}
                      />
                      <button
                        type="button"
                        class="button secondary"
                        onClick={() => handleBrowse("file", "right")}
                      >
                        参照...
                      </button>
                    </div>
                  </div>
                </>
              )
              : (
                <>
                  <div class="welcome-field">
                    <label class="welcome-label">
                      {tab === "dir"
                        ? "Base フォルダ (比較元):"
                        : "Left ファイル (比較元):"}
                    </label>
                    <div class="welcome-input-group">
                      <input
                        type="text"
                        class="welcome-input"
                        placeholder={tab === "dir"
                          ? "C:\\path\\to\\dir_a"
                          : "C:\\path\\to\\file_a"}
                        value={leftPath}
                        onInput={(e) =>
                          setLeftPath((e.target as HTMLInputElement).value)}
                      />
                      <button
                        type="button"
                        class="button secondary"
                        onClick={() =>
                          handleBrowse(tab === "dir" ? "dir" : "file", "left")}
                      >
                        参照...
                      </button>
                    </div>
                  </div>

                  <div class="welcome-field">
                    <label class="welcome-label">
                      {tab === "dir"
                        ? "Target フォルダ (比較先):"
                        : "Right ファイル (比較先):"}
                    </label>
                    <div class="welcome-input-group">
                      <input
                        type="text"
                        class="welcome-input"
                        placeholder={tab === "dir"
                          ? "C:\\path\\to\\dir_b"
                          : "C:\\path\\to\\file_b"}
                        value={rightPath}
                        onInput={(e) =>
                          setRightPath((e.target as HTMLInputElement).value)}
                      />
                      <button
                        type="button"
                        class="button secondary"
                        onClick={() =>
                          handleBrowse(tab === "dir" ? "dir" : "file", "right")}
                      >
                        参照...
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
                読み取り専用モード (編集・保存を無効化)
              </label>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="button secondary"
            onClick={handleClose}
          >
            キャンセル (Esc)
          </button>
          <button
            type="button"
            class="button primary"
            onClick={handleStart}
          >
            比較を開始
          </button>
        </div>
      </div>
    </div>
  );
}
