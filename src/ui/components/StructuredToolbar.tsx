/**
 * 構造化データ（JSON / YAML）用のツールバーコンポーネント（StructuredToolbar）。
 * Raw Diff と Canonical (正規化) Diff の切り替えを提供。
 */

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
            title="元のテキストのまま差分を表示"
          >
            Raw Diff
          </button>
          <button
            type="button"
            className={`btn-toggle ${isCanonical ? "active" : ""}`}
            onClick={() => onToggleCanonical(true)}
            title="キー順序を辞書順ソート・正規化して実質差分を表示"
          >
            Canonical (Normalized)
          </button>
        </div>
      </div>

      <div className="structured-toolbar-right">
        {isSemanticallyEqual && (
          <span className="semantic-equal-tag">
            ✓ Semantically Identical (No Value Changes)
          </span>
        )}
      </div>
    </div>
  );
}
