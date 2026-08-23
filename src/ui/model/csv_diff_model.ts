/**
 * CSV / TSV 比較の MVC モデル（CsvDiffModel: Smalltalk-80 スタイル）。
 */
import type { CsvDiffData, CsvRowDiff } from "../../core/types.ts";

export interface CsvDiffState {
  csvDiff: CsvDiffData;
  filterMode: "all" | "modified-only";
  searchQuery: string;
  leftFileName: string;
  rightFileName: string;
}

export class CsvDiffModel {
  private state: CsvDiffState;
  private listeners: Set<() => void> = new Set();

  constructor(
    csvDiff: CsvDiffData,
    leftFileName: string,
    rightFileName: string,
  ) {
    this.state = {
      csvDiff,
      filterMode: "all",
      searchQuery: "",
      leftFileName,
      rightFileName,
    };
  }

  public getState(): Readonly<CsvDiffState> {
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public setFilterMode(mode: "all" | "modified-only"): void {
    if (this.state.filterMode !== mode) {
      this.state = { ...this.state, filterMode: mode };
      this.notify();
    }
  }

  public setSearchQuery(query: string): void {
    if (this.state.searchQuery !== query) {
      this.state = { ...this.state, searchQuery: query };
      this.notify();
    }
  }

  public getFilteredRows(): CsvRowDiff[] {
    const { rows } = this.state.csvDiff;
    const { filterMode, searchQuery } = this.state;
    const query = searchQuery.trim().toLowerCase();

    return rows.filter((row) => {
      if (filterMode === "modified-only" && row.status === "identical") {
        return false;
      }
      if (query.length > 0) {
        const matches = row.cells.some((cell) =>
          (cell.leftValue?.toLowerCase().includes(query)) ||
          (cell.rightValue?.toLowerCase().includes(query))
        );
        if (!matches) return false;
      }
      return true;
    });
  }
}
