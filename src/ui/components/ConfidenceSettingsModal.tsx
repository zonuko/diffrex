/**
 * ConfidenceSettingsModal (B20-05)
 *
 * 確信度しきい値設定モーダル (Smalltalk-80 MVC View)。
 * TypeSafe Jev (System One) による各 Hunk の評価スコアに基づき、
 * 安全な差分 (Safe) および要精査差分 (Needs Review) のルーティング境界を調整する。
 */

import { useState } from "preact/hooks";
import type { MenuModel } from "../model/menu_model.ts";
import type { DiffSessionModel } from "../model/diff_session_model.ts";

export interface ConfidenceSettingsModalProps {
  menuModel: MenuModel;
  diffModel: DiffSessionModel;
}

export function ConfidenceSettingsModal({
  menuModel,
  diffModel,
}: ConfidenceSettingsModalProps) {
  const currentThresholds = diffModel.confidenceThresholds;

  const [safeVal, setSafeVal] = useState(
    Math.round(currentThresholds.safe * 100),
  );
  const [needsReviewVal, setNeedsReviewVal] = useState(
    Math.round(currentThresholds.needsReview * 100),
  );

  const handleClose = () => {
    menuModel.setConfidenceSettingsModalOpen(false);
  };

  const handleApply = () => {
    diffModel.setConfidenceThresholds({
      safe: safeVal / 100,
      needsReview: needsReviewVal / 100,
    });
    handleClose();
  };

  const handleReset = () => {
    setSafeVal(85);
    setNeedsReviewVal(60);
  };

  // プレビュー集計シミュレーション
  const hunks = diffModel.session?.hunks ?? [];
  const previewSafeCount = hunks.filter(
    (h) => (h.confidence ?? 0) >= safeVal / 100 && h.riskLevel === "normal",
  ).length;
  const previewNeedsReviewCount = hunks.filter(
    (h) =>
      h.riskLevel === "danger" ||
      (h.confidence !== undefined && h.confidence < needsReviewVal / 100) ||
      (h.intentAlignment !== undefined && h.intentAlignment === 0),
  ).length;

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div
        class="modal-card confidence-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confidence-modal-title"
        style={{ maxWidth: "520px" }}
      >
        <div class="modal-header">
          <h2 id="confidence-modal-title" class="modal-title">
            ⚙️ 確信度しきい値設定 (Confidence Thresholds)
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

        <div class="modal-body" style={{ padding: "16px 20px" }}>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-secondary, #aaa)",
              marginBottom: "16px",
            }}
          >
            TypeSafe Jev (System One) による確信度スコアに基づき、
            高確信度の安全な差分と要精査の疑義差分を自動トリアージする境界値を設定します。
          </p>

          {/* Safe しきい値 */}
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <label
                style={{
                  fontWeight: "bold",
                  fontSize: "13px",
                  color: "#22c55e",
                }}
              >
                🛡️ 安全な変更 (Safe) のしきい値
              </label>
              <span style={{ fontWeight: "bold", fontSize: "14px" }}>
                {safeVal}% 以上
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="99"
              value={safeVal}
              onInput={(e) =>
                setSafeVal(Number((e.target as HTMLInputElement).value))}
              style={{ width: "100%", accentColor: "#22c55e" }}
            />
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted, #888)",
                marginTop: "4px",
              }}
            >
              確信度がこの値以上かつ通常リスクの Hunk は緑の Safe
              バッジが付き、一括承認の対象となります。
            </div>
          </div>

          {/* Needs Review しきい値 */}
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <label
                style={{
                  fontWeight: "bold",
                  fontSize: "13px",
                  color: "#f59e0b",
                }}
              >
                ⚠️ 要精査 (Needs Review) のしきい値
              </label>
              <span style={{ fontWeight: "bold", fontSize: "14px" }}>
                {needsReviewVal}% 未満
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="80"
              value={needsReviewVal}
              onInput={(e) =>
                setNeedsReviewVal(Number((e.target as HTMLInputElement).value))}
              style={{ width: "100%", accentColor: "#f59e0b" }}
            />
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted, #888)",
                marginTop: "4px",
              }}
            >
              確信度がこの値を下回る（または高リスク・意図乖離の）Hunk
              は「要精査」として警告されます。
            </div>
          </div>

          {/* プレビュー情報 */}
          {hunks.length > 0 && (
            <div
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                padding: "10px 14px",
                borderRadius: "6px",
                fontSize: "12px",
                display: "flex",
                justifyContent: "space-around",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div>
                全体 Hunk 数: <strong>{hunks.length}</strong>
              </div>
              <div>
                Safe 候補:{" "}
                <strong style={{ color: "#22c55e" }}>{previewSafeCount}</strong>
                {" "}
                件
              </div>
              <div>
                要精査:{" "}
                <strong style={{ color: "#ef4444" }}>
                  {previewNeedsReviewCount}
                </strong>{" "}
                件
              </div>
            </div>
          )}
        </div>

        <div
          class="modal-footer"
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderTop: "1px solid var(--border-color, #333)",
          }}
        >
          <button
            type="button"
            class="modal-secondary-button"
            onClick={handleReset}
            style={{
              padding: "6px 14px",
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "4px",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            初期値に戻す (85% / 60%)
          </button>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              class="modal-secondary-button"
              onClick={handleClose}
              style={{
                padding: "6px 14px",
                background: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "4px",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              キャンセル
            </button>
            <button
              type="button"
              class="modal-primary-button"
              onClick={handleApply}
              style={{
                padding: "6px 16px",
                background: "var(--accent-color, #0284c7)",
                border: "none",
                borderRadius: "4px",
                color: "#fff",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              適用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
