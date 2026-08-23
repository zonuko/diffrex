/**
 * RFC 4180 準拠の CSV / TSV パーサーおよびグリッド差分計算ロジック。
 */
import type { CsvCellDiff, CsvDiffData, CsvRowDiff } from "../types.ts";

/**
 * CSV / TSV 文字列を行とセルの 2次元配列にパースする（RFC 4180 準拠）。
 */
export function parseCsv(content: string, delimiter?: string): string[][] {
  if (!content || content.trim().length === 0) {
    return [];
  }

  // デリミタ自動判定（未指定の場合）
  const delim = delimiter ||
    (content.includes("\t") && !content.includes(",") ? "\t" : ",");

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  let i = 0;
  const len = content.length;

  while (i < len) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && content[i + 1] === '"') {
          // エスケープされたダブルクォート
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // クォート終了
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }

    if (char === '"') {
      inQuotes = true;
      i++;
    } else if (char === delim) {
      currentRow.push(currentCell);
      currentCell = "";
      i++;
    } else if (char === "\r") {
      if (i + 1 < len && content[i + 1] === "\n") {
        i++;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      i++;
    } else if (char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      i++;
    } else {
      currentCell += char;
      i++;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * 2つの CSV / TSV コンテンツを比較し、ヘッダー・行・セルの差分データを生成する。
 */
export function diffCsv(
  leftContent: string,
  rightContent: string,
  delimiter?: string,
): CsvDiffData {
  const leftTable = parseCsv(leftContent, delimiter);
  const rightTable = parseCsv(rightContent, delimiter);

  // ヘッダー判定（1行目）
  const leftHeaders = leftTable.length > 0 ? leftTable[0] : [];
  const rightHeaders = rightTable.length > 0 ? rightTable[0] : [];
  const maxHeaderCols = Math.max(leftHeaders.length, rightHeaders.length);
  const headers: string[] = [];

  for (let c = 0; c < maxHeaderCols; c++) {
    const lh = leftHeaders[c] ?? "";
    const rh = rightHeaders[c] ?? "";
    headers.push(rh || lh || `Col ${c + 1}`);
  }

  const leftBody = leftTable.slice(1);
  const rightBody = rightTable.slice(1);
  const maxRows = Math.max(leftBody.length, rightBody.length);

  const diffRows: CsvRowDiff[] = [];
  let modifiedRowsCount = 0;
  let addedRowsCount = 0;
  let deletedRowsCount = 0;

  for (let r = 0; r < maxRows; r++) {
    const leftRow = leftBody[r];
    const rightRow = rightBody[r];

    if (!leftRow && rightRow) {
      // 追加行
      addedRowsCount++;
      const cells: CsvCellDiff[] = rightRow.map((val, c) => ({
        colIndex: c,
        rightValue: val,
        status: "added",
      }));
      diffRows.push({
        rowIndex: r,
        status: "added",
        cells,
      });
    } else if (leftRow && !rightRow) {
      // 削除行
      deletedRowsCount++;
      const cells: CsvCellDiff[] = leftRow.map((val, c) => ({
        colIndex: c,
        leftValue: val,
        status: "deleted",
      }));
      diffRows.push({
        rowIndex: r,
        status: "deleted",
        cells,
      });
    } else if (leftRow && rightRow) {
      // 既存行のセル比較
      const maxCols = Math.max(leftRow.length, rightRow.length, headers.length);
      const cells: CsvCellDiff[] = [];
      let isRowModified = false;

      for (let c = 0; c < maxCols; c++) {
        const lv = leftRow[c];
        const rv = rightRow[c];

        if (lv === undefined && rv !== undefined) {
          isRowModified = true;
          cells.push({ colIndex: c, rightValue: rv, status: "added" });
        } else if (lv !== undefined && rv === undefined) {
          isRowModified = true;
          cells.push({ colIndex: c, leftValue: lv, status: "deleted" });
        } else if (lv !== rv) {
          isRowModified = true;
          cells.push({
            colIndex: c,
            leftValue: lv,
            rightValue: rv,
            status: "modified",
          });
        } else {
          cells.push({
            colIndex: c,
            leftValue: lv,
            rightValue: rv,
            status: "identical",
          });
        }
      }

      if (isRowModified) {
        modifiedRowsCount++;
      }

      diffRows.push({
        rowIndex: r,
        status: isRowModified ? "modified" : "identical",
        cells,
      });
    }
  }

  return {
    headers,
    rows: diffRows,
    totalRowsLeft: leftBody.length,
    totalRowsRight: rightBody.length,
    modifiedRowsCount,
    addedRowsCount,
    deletedRowsCount,
  };
}
