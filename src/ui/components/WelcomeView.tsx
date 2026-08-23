/**
 * WelcomeView (B1-06)
 *
 * 引数なし起動時に表示される、比較対象（フォルダ / ファイル）の選択・開始画面。
 */

import { useState } from "preact/hooks";
import type { DirectoryController } from "../controller/dir_controller.ts";

export interface WelcomeViewProps {
  controller: DirectoryController;
}

export function WelcomeView({ controller }: WelcomeViewProps) {
  const [tab, setTab] = useState<"dir" | "file">("dir");
  const [basePath, setBasePath] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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

  return (
    <div class="welcome-container">
      <div class="welcome-card">
        <div class="welcome-header">
          <div class="welcome-logo">Diffrex</div>
          <p class="welcome-subtitle">AI-Friendly Diff & Merge Tool</p>
        </div>

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
          <div class="welcome-form-group">
            <label class="welcome-label">
              {tab === "dir"
                ? "Base フォルダ（変更前 / 旧）"
                : "Base ファイル（変更前 / 旧）"}
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

          <div class="welcome-form-group">
            <label class="welcome-label">
              {tab === "dir"
                ? "Target フォルダ（変更後 / 新・編集先）"
                : "Target ファイル（変更後 / 新・編集先）"}
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
        </div>
      </div>
    </div>
  );
}
