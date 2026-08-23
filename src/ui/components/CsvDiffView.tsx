/**
 * CSV / TSV テーブルグリッド差分ビューコンポーネント（CsvDiffView）。
 */
import { useEffect, useState } from "preact/hooks";
import type { CsvDiffModel } from "../model/csv_diff_model.ts";
import type { CsvController } from "../controller/csv_controller.ts";

export interface CsvDiffViewProps {
  model: CsvDiffModel;
  controller: CsvController;
}

export function CsvDiffView({ model, controller }: CsvDiffViewProps) {
  const [state, setState] = useState(model.getState());

  useEffect(() => {
    const unsubscribe = model.subscribe(() => {
      setState(model.getState());
    });
    return unsubscribe;
  }, [model]);

  const filteredRows = model.getFilteredRows();
  const {
    headers,
    totalRowsLeft,
    totalRowsRight,
    modifiedRowsCount,
    addedRowsCount,
    deletedRowsCount,
  } = state.csvDiff;

  return (
    <div className="csv-diff-container">
      {/* ツールバー */}
      <div className="csv-diff-toolbar">
        <div className="csv-toolbar-left">
          <span className="csv-badge">CSV / Table Diff</span>
          <div className="csv-filter-group">
            <button
              type="button"
              className={`btn-csv-filter ${
                state.filterMode === "all" ? "active" : ""
              }`}
              onClick={() => controller.setFilterMode("all")}
            >
              All Rows ({filteredRows.length})
            </button>
            <button
              type="button"
              className={`btn-csv-filter ${
                state.filterMode === "modified-only" ? "active" : ""
              }`}
              onClick={() => controller.setFilterMode("modified-only")}
            >
              Modified Only ({modifiedRowsCount + addedRowsCount +
                deletedRowsCount})
            </button>
          </div>
          <div className="csv-search-box">
            <input
              type="text"
              placeholder="Search table..."
              value={state.searchQuery}
              onInput={(e) =>
                controller.setSearchQuery((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>

        <div className="csv-toolbar-right">
          <div className="csv-stats">
            <span className="stat-item">
              Rows: {totalRowsLeft} → {totalRowsRight}
            </span>
            {modifiedRowsCount > 0 && (
              <span className="stat-badge stat-mod">~{modifiedRowsCount}</span>
            )}
            {addedRowsCount > 0 && (
              <span className="stat-badge stat-add">+{addedRowsCount}</span>
            )}
            {deletedRowsCount > 0 && (
              <span className="stat-badge stat-del">-{deletedRowsCount}</span>
            )}
          </div>
        </div>
      </div>

      {/* テーブルグリッド */}
      <div className="csv-table-wrapper">
        <table className="csv-diff-table">
          <thead>
            <tr>
              <th className="th-line">#</th>
              <th className="th-status">Diff</th>
              {headers.map((h, i) => (
                <th key={i} className="th-col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0
              ? (
                <tr>
                  <td colSpan={headers.length + 2} className="csv-empty">
                    No matching rows found
                  </td>
                </tr>
              )
              : (
                filteredRows.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={`csv-row row-${row.status}`}
                  >
                    <td className="td-line">{row.rowIndex + 1}</td>
                    <td className="td-status">
                      {row.status === "added" && (
                        <span className="badge-add">+</span>
                      )}
                      {row.status === "deleted" && (
                        <span className="badge-del">-</span>
                      )}
                      {row.status === "modified" && (
                        <span className="badge-mod">~</span>
                      )}
                    </td>
                    {headers.map((_, colIdx) => {
                      const cell = row.cells[colIdx];
                      if (!cell) {
                        return <td key={colIdx} className="td-cell empty" />;
                      }

                      if (cell.status === "modified") {
                        return (
                          <td key={colIdx} className="td-cell cell-modified">
                            <div className="cell-diff-split">
                              <span className="cell-old">
                                {cell.leftValue ?? ""}
                              </span>
                              <span className="cell-arrow">→</span>
                              <span className="cell-new">
                                {cell.rightValue ?? ""}
                              </span>
                            </div>
                          </td>
                        );
                      } else if (cell.status === "added") {
                        return (
                          <td key={colIdx} className="td-cell cell-added">
                            {cell.rightValue ?? ""}
                          </td>
                        );
                      } else if (cell.status === "deleted") {
                        return (
                          <td key={colIdx} className="td-cell cell-deleted">
                            {cell.leftValue ?? ""}
                          </td>
                        );
                      } else {
                        return (
                          <td key={colIdx} className="td-cell cell-identical">
                            {cell.rightValue ?? cell.leftValue ?? ""}
                          </td>
                        );
                      }
                    })}
                  </tr>
                ))
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
