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
import { i18n } from "../i18n/i18n_model.ts";

export interface HeaderProps {
  model: DiffSessionModel;
  controller: DiffController;
}

export function Header({ model, controller }: HeaderProps) {
  useModel(model);
  useModel(i18n);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  const session = model.session;
  const connectionStatus = model.connectionStatus;

  const mode = session?.mode?.toUpperCase() ?? "2-WAY";
  const agent = session?.aiContext?.agent;
  const modelName = session?.aiContext?.model;
  const prompt = session?.aiContext?.prompt;

  const isConnected = connectionStatus === "connected";
  const statusLabel = connectionStatus === "connected"
    ? i18n.t("header.connected")
    : connectionStatus === "connecting"
    ? i18n.t("header.connecting")
    : i18n.t("header.disconnected");

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
                {i18n.t("header.jevSystemOne")}
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
                  ? (
                    <span>
                      {i18n.t("header.allReviewed", { total: totalHunks })}
                    </span>
                  )
                  : (
                    <span>
                      {i18n.t("header.unreviewed", {
                        unreviewed,
                        total: totalHunks,
                      })}
                    </span>
                  )}
              </span>
              {statusCounts.accepted > 0 && (
                <span class="stat-badge accepted" title="Accepted hunks">
                  {i18n.t("header.acceptedBadge", {
                    count: statusCounts.accepted,
                  })}
                </span>
              )}
              {statusCounts.rejected > 0 && (
                <span class="stat-badge rejected" title="Rejected hunks">
                  {i18n.t("header.rejectedBadge", {
                    count: statusCounts.rejected,
                  })}
                </span>
              )}
              {statusCounts.edited > 0 && (
                <span class="stat-badge edited" title="Edited hunks">
                  {i18n.t("header.editedBadge", { count: statusCounts.edited })}
                </span>
              )}
              {riskCounts.danger > 0 && (
                <span class="stat-badge danger" title="High Risk Changes">
                  {i18n.t("header.dangerBadge", { count: riskCounts.danger })}
                </span>
              )}
              {riskCounts.warning > 0 && (
                <span class="stat-badge warning" title="Warnings">
                  {i18n.t("header.warningBadge", { count: riskCounts.warning })}
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
                  {i18n.t("header.safeBadge", { count: safeCount })}
                </span>
              )}
            </div>
          )}

          {noiseCount > 0 && (
            <button
              type="button"
              class={`filter-toggle-btn ${isNoiseFolded ? "active" : ""}`}
              onClick={() => controller.toggleNoiseFolded()}
              title={i18n.t("header.noiseFoldedTitle")}
            >
              <span class="toggle-icon">{isNoiseFolded ? "▶" : "▼"}</span>
              <span>
                {isNoiseFolded
                  ? i18n.t("header.noiseFolded", { count: noiseCount })
                  : i18n.t("header.noiseVisible", { count: noiseCount })}
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
            <span class="prompt-label">{i18n.t("header.prompt")}</span>
            {isPromptLong && (
              <span class="prompt-expand-hint">
                {isPromptExpanded
                  ? i18n.t("header.collapsePrompt")
                  : i18n.t("header.expandPrompt")}
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
