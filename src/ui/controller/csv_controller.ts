/**
 * CSV / TSV 比較の MVC コントローラ（CsvController: Smalltalk-80 スタイル）。
 */
import type { CsvDiffModel } from "../model/csv_diff_model.ts";

export class CsvController {
  private model: CsvDiffModel;

  constructor(model: CsvDiffModel) {
    this.model = model;
  }

  public setFilterMode(mode: "all" | "modified-only"): void {
    this.model.setFilterMode(mode);
  }

  public setSearchQuery(query: string): void {
    this.model.setSearchQuery(query);
  }
}
