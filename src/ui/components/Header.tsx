/**
 * Header View コンポーネント (Smalltalk-80 MVC View)
 *
 * Model (DiffSessionModel) を購読し、セッション情報、AI コンテキスト（Prompt/Agent/Model）、
 * レビュー統計、およびノイズ表示切り替えボタンを描画する。
 */

import { useState } from "preact/hooks";
import type { DiffSessionModel } from "../model/diff_session_model.ts";
import type { DiffController } from "../controller/diff_controller.ts";
import { useModel } from "../hooks/use_model.ts";

export interface HeaderProps {
  model: DiffSessionModel;
  controller: DiffController;
}

export function Header({ model, controller }: HeaderProps) {
  useModel(model);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  const session = model.session;
  const connectionStatus = model.connectionStatus;

  const mode = session?.mode?.toUpperCase() ?? "2-WAY";
  const agent = session?.aiContext?.agent;
  const modelName = session?.aiContext?.model;
  const prompt = session?.aiContext?.prompt;

  const isConnected = connectionStatus === "connected";
  const statusLabel = connectionStatus === "connected"
    ? "Connected"
    : connectionStatus === "connecting"
    ? "Connecting..."
    : "Disconnected";

  const totalHunks = session?.hunks?.length ?? model.chunks.length;
  const unreviewed = model.unreviewedCount;
  const statusCounts = model.statusCounts;
  const isAllReviewed = model.isAllReviewed;
  const noiseCount = model.noiseCount;
  const riskCounts = model.riskCounts;
  const isNoiseFolded = model.noiseFolded;
  const hasJev = model.hasJevAnalysis;
  const safeCount = model.safeCount;

  const isPromptLong = Boolean(prompt && prompt.length > 80);

  return (
    <div class="header-container">
      <header class="app-header">
        <div class="header-section header-left">
          <div class="brand">
            <img
              src="/icon.svg"
              class="app-brand-icon"
              alt="Diffrex"
              width="20"
              height="20"
            />
            <h1>Diffrex</h1>
            <span class="badge mode">{mode}</span>
          </div>

          <div class="ai-meta">
            {agent && <span class="badge agent">Agent: {agent}</span>}
            {modelName && <span class="badge model">Model: {modelName}</span>}
            {hasJev && (
              <span
                class="badge jev"
                title="TypeSafe Jev System One Semantic Analysis"
                style={{
                  background: "rgba(229, 81, 186, 0.15)",
                  color: "#e551ba",
                  borderColor: "rgba(229, 81, 186, 0.3)",
                }}
              >
                ⚡ Jev System One
              </span>
            )}
          </div>
        </div>

        <div class="header-section header-center">
          {totalHunks > 0 && (
            <div class="hunk-stats">
              <span
                class={`stat-item unreviewed ${
                  isAllReviewed ? "completed" : ""
                }`}
                title={`Accepted: ${statusCounts.accepted}, Rejected: ${statusCounts.rejected}, Edited: ${statusCounts.edited}`}
              >
                {isAllReviewed
                  ? <span>✓ All Reviewed ({totalHunks}/{totalHunks})</span>
                  : (
                    <span>
                      Unreviewed: <strong>{unreviewed}/{totalHunks}</strong>
                    </span>
                  )}
              </span>
              {statusCounts.accepted > 0 && (
                <span class="stat-badge accepted" title="Accepted hunks">
                  ✓ {statusCounts.accepted}
                </span>
              )}
              {statusCounts.rejected > 0 && (
                <span class="stat-badge rejected" title="Rejected hunks">
                  ✗ {statusCounts.rejected}
                </span>
              )}
              {statusCounts.edited > 0 && (
                <span class="stat-badge edited" title="Edited hunks">
                  ✎ {statusCounts.edited}
                </span>
              )}
              {riskCounts.danger > 0 && (
                <span class="stat-badge danger" title="High Risk Changes">
                  ⚠️ {riskCounts.danger} danger
                </span>
              )}
              {riskCounts.warning > 0 && (
                <span class="stat-badge warning" title="Warnings">
                  ⚡ {riskCounts.warning} warn
                </span>
              )}
              {safeCount > 0 && (
                <span
                  class="stat-badge safe"
                  title="High-confidence Safe Changes (Confidence >= 85%)"
                  style={{
                    background: "rgba(34, 197, 94, 0.15)",
                    color: "#22c55e",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "12px",
                  }}
                >
                  🛡️ {safeCount} safe
                </span>
              )}
            </div>
          )}

          {noiseCount > 0 && (
            <button
              type="button"
              class={`filter-toggle-btn ${isNoiseFolded ? "active" : ""}`}
              onClick={() => controller.toggleNoiseFolded()}
              title="Toggle noise hunks visibility (Ctrl+N)"
            >
              <span class="toggle-icon">{isNoiseFolded ? "▶" : "▼"}</span>
              <span>
                {isNoiseFolded
                  ? `Noise folded (${noiseCount})`
                  : `Noise visible (${noiseCount})`}
              </span>
              <kbd>Ctrl+N</kbd>
            </button>
          )}
        </div>

        <div class="header-section header-right">
          <div class="status-indicator">
            <span class={`status-dot ${isConnected ? "connected" : ""}`} />
            <span>{statusLabel}</span>
          </div>
        </div>
      </header>

      {prompt && (
        <div
          class={`prompt-banner ${isPromptExpanded ? "expanded" : "collapsed"}`}
        >
          <div
            class="prompt-header"
            onClick={() =>
              isPromptLong && setIsPromptExpanded(!isPromptExpanded)}
          >
            <span class="prompt-label">Prompt</span>
            {isPromptLong && (
              <span class="prompt-expand-hint">
                {isPromptExpanded ? "▲ Collapse" : "▼ Expand full prompt"}
              </span>
            )}
          </div>
          <div
            class="prompt-content"
            onClick={() =>
              isPromptLong && setIsPromptExpanded(!isPromptExpanded)}
          >
            {prompt}
          </div>
        </div>
      )}
    </div>
  );
}
