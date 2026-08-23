// Diffrex fixture: sample_base.ts <-> sample_target.ts (LF / 末尾改行あり)
// 2ファイルの差分に、以下の5ケースを1組で含める。
//   (1) ロジック変更          : calcTotal の税率       -> risk normal
//   (2) インデントのみ変更    : formatLabel の本文     -> noise
//   (3) コメントのみ変更      : parseConfig のコメント -> noise
//   (4) 連続12行の削除        : legacyReport 全体      -> risk danger
//   (5) 関数シグネチャ変更    : applyDiscount          -> risk danger
// このファイルは deno fmt / deno lint の対象外（意図的な整形崩れを保持する）。

export function calcTotal(items: number[]): number {
  let total = 0;
  for (const item of items) {
    total += item;
  }
  return total * 1.08;
}

export function formatLabel(name: string, count: number): string {
  const label = name + " (" + count + ")";
  return label.trim();
}

export function parseConfig(raw: string): Record<string, string> {
  // 設定文字列を key=value 形式でパースする
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const [key, value] = line.split("=");
    if (key && value) {
      result[key.trim()] = value.trim();
    }
  }
  return result;
}

// --- (4) DELETED-BLOCK-START: ここから12行が sample_target.ts では削除される ---
export function legacyReport(rows: string[][]): string {
  const header = rows[0] === undefined ? "" : rows[0].join(",");
  const body = rows.slice(1).map((row) => row.join(",")).join("\n");
  if (header === "") {
    return "";
  }
  try {
    return header + "\n" + body;
  } catch (_err) {
    return "";
  }
}
// --- (4) DELETED-BLOCK-END ---

export function applyDiscount(price: number): number {
  return price * 0.9;
}
