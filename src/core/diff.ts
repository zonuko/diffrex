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

  // 1. 先頭一致行（Common Prefix）のスキップ (FIX-08)
  let prefix = 0;
  while (prefix < n && prefix < m && aLines[prefix] === bLines[prefix]) {
    prefix++;
  }

  // 2. 末尾一致行（Common Suffix）のスキップ (FIX-08)
  let suffix = 0;
  while (
    suffix < n - prefix &&
    suffix < m - prefix &&
    aLines[n - 1 - suffix] === bLines[m - 1 - suffix]
  ) {
    suffix++;
  }

  const prefixItems: DiffItem[] = [];
  for (let i = 0; i < prefix; i++) {
    prefixItems.push({
      op: "equal",
      line: aLines[i],
      leftLineNo: i + 1,
      rightLineNo: i + 1,
    });
  }

  const suffixItems: DiffItem[] = [];
  for (let i = 0; i < suffix; i++) {
    const leftIdx = n - suffix + i;
    const rightIdx = m - suffix + i;
    suffixItems.push({
      op: "equal",
      line: aLines[leftIdx],
      leftLineNo: leftIdx + 1,
      rightLineNo: rightIdx + 1,
    });
  }

  const midA = aLines.slice(prefix, n - suffix);
  const midB = bLines.slice(prefix, m - suffix);

  let middleItems: DiffItem[] = [];
  if (midA.length === 0 && midB.length === 0) {
    // 差分なし（全行一致）
    return [...prefixItems, ...suffixItems];
  } else if (midA.length === 0) {
    middleItems = midB.map((line, idx) => ({
      op: "insert",
      line,
      rightLineNo: prefix + idx + 1,
    }));
  } else if (midB.length === 0) {
    middleItems = midA.map((line, idx) => ({
      op: "delete",
      line,
      leftLineNo: prefix + idx + 1,
    }));
  } else {
    middleItems = computeMyersDiffCore(midA, midB, prefix);
  }

  return [...prefixItems, ...middleItems, ...suffixItems];
}

/**
 * Myers Diff コア探索（TypedArray による高速化 & Map 生成削減）
 */
function computeMyersDiffCore(
  aLines: string[],
  bLines: string[],
  lineOffset: number,
): DiffItem[] {
  const n = aLines.length;
  const m = bLines.length;
  const max = n + m;
  const offset = max + 1;

  // v 配列のサイズ: 2 * max + 3
  const v = new Int32Array(2 * max + 3);
  v.fill(-1);
  v[1 + offset] = 0;

  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    // 直前ステップまでの v の有効範囲 [-d-1, d+1] (長さ 2d + 3) をスライス保存
    const snapshot = new Int32Array(2 * d + 3);
    snapshot.set(v.subarray(-d - 1 + offset, d + 2 + offset));
    trace.push(snapshot);

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      const vKMinus = v[k - 1 + offset];
      const vKPlus = v[k + 1 + offset];

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

      v[k + offset] = x;

      if (x >= n && y >= m) {
        // バックトラックして操作列を構築
        return backtrackTyped(trace, aLines, bLines, d, lineOffset);
      }
    }
  }

  return [];
}

/**
 * Myers diff の探索トレースをバックトラックして DiffItem[] を生成する。
 */
function backtrackTyped(
  trace: Int32Array[],
  aLines: string[],
  bLines: string[],
  d: number,
  lineOffset: number,
): DiffItem[] {
  const items: DiffItem[] = [];
  let x = aLines.length;
  let y = bLines.length;

  for (let step = d; step > 0; step--) {
    const vSnapshot = trace[step];
    const k = x - y;

    // snapshot では k' のインデックスは k' + step + 1
    const idxKMinus = (k - 1) + step + 1;
    const idxKPlus = (k + 1) + step + 1;

    const vKMinus = (idxKMinus >= 0 && idxKMinus < vSnapshot.length)
      ? vSnapshot[idxKMinus]
      : -1;
    const vKPlus = (idxKPlus >= 0 && idxKPlus < vSnapshot.length)
      ? vSnapshot[idxKPlus]
      : -1;

    let prevK: number;
    if (k === -step || (k !== step && vKMinus < vKPlus)) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const idxPrevK = prevK + step + 1;
    const prevX = (idxPrevK >= 0 && idxPrevK < vSnapshot.length)
      ? vSnapshot[idxPrevK]
      : 0;
    const prevY = prevX - prevK;

    // 対角線部分の回収（equal）
    while (x > prevX && y > prevY && x > 0 && y > 0) {
      items.push({
        op: "equal",
        line: aLines[x - 1],
        leftLineNo: x + lineOffset,
        rightLineNo: y + lineOffset,
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
          rightLineNo: y + lineOffset,
        });
        y--;
      }
    } else {
      // 右への移動（delete）
      if (x > 0) {
        items.push({
          op: "delete",
          line: aLines[x - 1],
          leftLineNo: x + lineOffset,
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
      leftLineNo: x + lineOffset,
      rightLineNo: y + lineOffset,
    });
    x--;
    y--;
  }

  while (x > 0) {
    items.push({
      op: "delete",
      line: aLines[x - 1],
      leftLineNo: x + lineOffset,
    });
    x--;
  }

  while (y > 0) {
    items.push({
      op: "insert",
      line: bLines[y - 1],
      rightLineNo: y + lineOffset,
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
