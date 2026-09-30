/**
 * 構造化データ（JSON / YAML）用のツールバーコンポーネント（StructuredToolbar）。
 * Raw Diff と Canonical (正規化) Diff の切り替えを提供（i18n 対応）。
 */

import { useModel } from "../hooks/use_model.ts";
import { i18n } from "../i18n/i18n_model.ts";

export interface StructuredToolbarProps {
  fileType: "json" | "yaml";
  isCanonical: boolean;
  isSemanticallyEqual: boolean;
  onToggleCanonical: (canonical: boolean) => void;
}

export function StructuredToolbar({
  fileType,
  isCanonical,
  isSemanticallyEqual,
  onToggleCanonical,
}: StructuredToolbarProps) {
  useModel(i18n);
  const label = fileType === "json" ? "JSON" : "YAML";

  return (
    <div className="structured-toolbar">
      <div className="structured-toolbar-left">
        <span className="structured-badge">{label}</span>
        <div className="toggle-group">
          <button
            type="button"
            className={`btn-toggle ${!isCanonical ? "active" : ""}`}
            onClick={() => onToggleCanonical(false)}
            title={i18n.t("structuredToolbar.rawDiffTitle")}
          >
            {i18n.t("structuredToolbar.rawDiff")}
          </button>
          <button
            type="button"
            className={`btn-toggle ${isCanonical ? "active" : ""}`}
            onClick={() => onToggleCanonical(true)}
            title={i18n.t("structuredToolbar.canonicalTitle")}
          >
            {i18n.t("structuredToolbar.canonical")}
          </button>
        </div>
      </div>

      <div className="structured-toolbar-right">
        {isSemanticallyEqual && (
          <span className="semantic-equal-tag">
            {i18n.t("structuredToolbar.semanticallyIdentical")}
          </span>
        )}
      </div>
    </div>
  );
}
