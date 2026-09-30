/**
 * OpenSessionModal (B8-03 Smalltalk-80 MVC View)
 *
 * ファイル比較・フォルダ比較・Git リポジトリ・3-Way マージを
 * メニューバーから即座に開始するためのダイアログモーダル（i18n 対応）。
 */

import { useState } from "preact/hooks";
import type { MenuModel } from "../model/menu_model.ts";
import type { DirectoryController } from "../controller/dir_controller.ts";
import { useModel } from "../hooks/use_model.ts";
import { i18n } from "../i18n/i18n_model.ts";

export interface OpenSessionModalProps {
  model: MenuModel;
  controller: DirectoryController;
}

export function OpenSessionModal({
  model,
  controller,
}: OpenSessionModalProps) {
  useModel(i18n);

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
        setErrorMsg(i18n.t("openSessionModal.errors.specifyBothFiles"));
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
        setErrorMsg(i18n.t("openSessionModal.errors.specifyBothDirs"));
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
        setErrorMsg(i18n.t("openSessionModal.errors.specifyGitRepo"));
        return;
      }
      handleClose();
      controller.startGitSession(gitRepoPath.trim(), {
        branch: gitBranch.trim() || undefined,
        readOnly,
      });
    } else if (tab === "3way") {
      if (!leftPath.trim() || !basePath.trim() || !rightPath.trim()) {
        setErrorMsg(i18n.t("openSessionModal.errors.specifyThreeWayFiles"));
        return;
      }
      handleClose();
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
            📂 {i18n.t("openSessionModal.title")}
          </h2>
          <button
            type="button"
            class="modal-close-button"
            onClick={handleClose}
            aria-label={i18n.t("openSessionModal.cancel")}
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
              {i18n.t("openSessionModal.tabFile")}
            </button>
            <button
              type="button"
              class={`welcome-tab ${tab === "dir" ? "active" : ""}`}
              onClick={() => {
                setTab("dir");
                setErrorMsg("");
              }}
            >
              {i18n.t("openSessionModal.tabDir")}
            </button>
            <button
              type="button"
              class={`welcome-tab ${tab === "git" ? "active" : ""}`}
              onClick={() => {
                setTab("git");
                setErrorMsg("");
              }}
            >
              {i18n.t("openSessionModal.tabGit")}
            </button>
            <button
              type="button"
              class={`welcome-tab ${tab === "3way" ? "active" : ""}`}
              onClick={() => {
                setTab("3way");
                setErrorMsg("");
              }}
            >
              {i18n.t("openSessionModal.tab3Way")}
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
                    <label class="welcome-label">
                      {i18n.t("openSessionModal.gitRepo")}:
                    </label>
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
                        {i18n.t("openSessionModal.browse")}
                      </button>
                    </div>
                  </div>

                  <div class="welcome-field">
                    <label class="welcome-label">
                      {i18n.t("openSessionModal.branchOptional")}:
                    </label>
                    <input
                      type="text"
                      class="welcome-input"
                      placeholder="main, HEAD~1, feature..."
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
                    <label class="welcome-label">
                      {i18n.t("openSessionModal.localFile")}:
                    </label>
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
                        {i18n.t("openSessionModal.browse")}
                      </button>
                    </div>
                  </div>

                  <div class="welcome-field">
                    <label class="welcome-label">
                      {i18n.t("openSessionModal.ancestorFile")}:
                    </label>
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
                        {i18n.t("openSessionModal.browse")}
                      </button>
                    </div>
                  </div>

                  <div class="welcome-field">
                    <label class="welcome-label">
                      {i18n.t("openSessionModal.remoteFile")}:
                    </label>
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
                        {i18n.t("openSessionModal.browse")}
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
                        ? `${i18n.t("openSessionModal.baseDir")}:`
                        : `${i18n.t("openSessionModal.baseFile")}:`}
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
                        {i18n.t("openSessionModal.browse")}
                      </button>
                    </div>
                  </div>

                  <div class="welcome-field">
                    <label class="welcome-label">
                      {tab === "dir"
                        ? `${i18n.t("openSessionModal.targetDir")}:`
                        : `${i18n.t("openSessionModal.targetFile")}:`}
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
                        {i18n.t("openSessionModal.browse")}
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
                {i18n.t("openSessionModal.readOnly")}
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
            {i18n.t("openSessionModal.cancel")} (Esc)
          </button>
          <button
            type="button"
            class="button primary"
            onClick={handleStart}
          >
            {i18n.t("openSessionModal.startSession")}
          </button>
        </div>
      </div>
    </div>
  );
}
