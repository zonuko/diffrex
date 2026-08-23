/**
 * 行単位の Myers Diff アルゴリズムおよび Hunk（差分ブロック）抽出モジュール (P4-01)。
 */

export interface DiffHunkRaw {
  /** Left (Base) の変更開始行 (1-based) */
  lineStartLeft: number;
  /** Left (Base) の変更終了行 (1-based, 挿入のみ時は lineStartLeft - 1) */
  lineEndLeft: number;
  /** Right (Target) の変更開始行 (1-based) */
  lineStartRight: number;
  /** Right (Target) の変更終了行 (1-based, 削除のみ時は lineStartRight - 1) */
  lineEndRight: number;
  /** Left 側で削除/変更された行の内容 */
  leftLines: string[];
  /** Right 側で追加/変更された行の内容 */
  rightLines: string[];
}

export type DiffOperation = "equal" | "delete" | "insert";

export interface DiffItem {
  op: DiffOperation;
  /** 行文字列（改行なし） */
  line: string;
  /** Left 側の行番号 (1-based, delete / equal のみ) */
  leftLineNo?: number;
  /** Right 側の行番号 (1-based, insert / equal のみ) */
  rightLineNo?: number;
}

/**
 * 改行コード（CRLF / LF）でテキストを行の配列に分割する。
 */
export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.split(/\r?\n/);
}

/**
 * Myers Diff アルゴリズム（行単位）を用いて 2 つの文字列配列の差分手順（Edit Script）を計算する。
 */
export function computeLineDiff(
  aLines: string[],
  bLines: string[],
): DiffItem[] {
  const n = aLines.length;
  const m = bLines.length;

  if (n === 0 && m === 0) {
    return [];
  }
  if (n === 0) {
    return bLines.map((line, idx) => ({
      op: "insert",
      line,
      rightLineNo: idx + 1,
    }));
  }
  if (m === 0) {
    return aLines.map((line, idx) => ({
      op: "delete",
      line,
      leftLineNo: idx + 1,
    }));
  }

  // Myers diff
  const max = n + m;
  const v = new Map<number, number>();
  v.set(1, 0);

  const trace: Map<number, number>[] = [];

  for (let d = 0; d <= max; d++) {
    const vCopy = new Map(v);
    trace.push(vCopy);

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      const vKMinus = v.get(k - 1) ?? -1;
      const vKPlus = v.get(k + 1) ?? -1;

      if (k === -d || (k !== d && vKMinus < vKPlus)) {
        x = vKPlus; // 下への移動（insert）
      } else {
        x = vKMinus + 1; // 右への移動（delete）
      }

      let y = x - k;

      // 対角線（equal）に沿って進む
      while (x < n && y < m && aLines[x] === bLines[y]) {
        x++;
        y++;
      }

      v.set(k, x);

      if (x >= n && y >= m) {
        // バックトラックして操作列を構築
        return backtrack(trace, aLines, bLines, d, k);
      }
    }
  }

  return [];
}

/**
 * Myers diff の探索トレースをバックトラックして DiffItem[] を生成する。
 */
function backtrack(
  trace: Map<number, number>[],
  aLines: string[],
  bLines: string[],
  d: number,
  _k: number,
): DiffItem[] {
  const items: DiffItem[] = [];
  let x = aLines.length;
  let y = bLines.length;

  for (let step = d; step > 0; step--) {
    const v = trace[step];
    const k = x - y;

    const vKMinus = v.get(k - 1) ?? -1;
    const vKPlus = v.get(k + 1) ?? -1;

    let prevK: number;
    if (k === -step || (k !== step && vKMinus < vKPlus)) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    // 対角線部分の回収（equal）
    while (x > prevX && y > prevY && x > 0 && y > 0) {
      items.push({
        op: "equal",
        line: aLines[x - 1],
        leftLineNo: x,
        rightLineNo: y,
      });
      x--;
      y--;
    }

    if (prevK === k + 1) {
      // 下への移動（insert）
      if (y > 0) {
        items.push({
          op: "insert",
          line: bLines[y - 1],
          rightLineNo: y,
        });
        y--;
      }
    } else {
      // 右への移動（delete）
      if (x > 0) {
        items.push({
          op: "delete",
          line: aLines[x - 1],
          leftLineNo: x,
        });
        x--;
      }
    }
  }

  // 残りの先頭部分（equal）
  while (x > 0 && y > 0) {
    items.push({
      op: "equal",
      line: aLines[x - 1],
      leftLineNo: x,
      rightLineNo: y,
    });
    x--;
    y--;
  }

  while (x > 0) {
    items.push({
      op: "delete",
      line: aLines[x - 1],
      leftLineNo: x,
    });
    x--;
  }

  while (y > 0) {
    items.push({
      op: "insert",
      line: bLines[y - 1],
      rightLineNo: y,
    });
    y--;
  }

  items.reverse();
  return items;
}

/**
 * DiffItem[] から連続する変更を Hunk（DiffHunkRaw）の配列として集約する。
 */
export function extractHunks(diffItems: DiffItem[]): DiffHunkRaw[] {
  const hunks: DiffHunkRaw[] = [];
  let currentLeftLines: string[] = [];
  let currentRightLines: string[] = [];
  let startLeft = -1;
  let startRight = -1;
  let lastLeftNo = 0;
  let lastRightNo = 0;

  function flushHunk() {
    if (currentLeftLines.length > 0 || currentRightLines.length > 0) {
      const lineStartLeft = startLeft !== -1 ? startLeft : lastLeftNo + 1;
      const lineEndLeft = currentLeftLines.length > 0
        ? lineStartLeft + currentLeftLines.length - 1
        : lineStartLeft - 1;

      const lineStartRight = startRight !== -1 ? startRight : lastRightNo + 1;
      const lineEndRight = currentRightLines.length > 0
        ? lineStartRight + currentRightLines.length - 1
        : lineStartRight - 1;

      hunks.push({
        lineStartLeft,
        lineEndLeft,
        lineStartRight,
        lineEndRight,
        leftLines: [...currentLeftLines],
        rightLines: [...currentRightLines],
      });

      currentLeftLines = [];
      currentRightLines = [];
      startLeft = -1;
      startRight = -1;
    }
  }

  for (const item of diffItems) {
    if (item.op === "equal") {
      flushHunk();
      lastLeftNo = item.leftLineNo!;
      lastRightNo = item.rightLineNo!;
    } else if (item.op === "delete") {
      if (startLeft === -1) {
        startLeft = item.leftLineNo!;
      }
      if (startRight === -1) {
        startRight = lastRightNo + 1;
      }
      currentLeftLines.push(item.line);
    } else if (item.op === "insert") {
      if (startRight === -1) {
        startRight = item.rightLineNo!;
      }
      if (startLeft === -1) {
        startLeft = lastLeftNo + 1;
      }
      currentRightLines.push(item.line);
    }
  }

  flushHunk();
  return hunks;
}

/**
 * 2 つの文字列から DiffHunkRaw[] を一括抽出するコンビニエンス関数。
 */
export function diffLinesToHunks(
  leftContent: string,
  rightContent: string,
): DiffHunkRaw[] {
  const leftLines = splitLines(leftContent);
  const rightLines = splitLines(rightContent);
  const diffItems = computeLineDiff(leftLines, rightLines);
  return extractHunks(diffItems);
}
