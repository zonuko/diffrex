/**
 * Unified Diff（統一差分形式）生成モジュール (B-9)。
 *
 * Myers Diff アルゴリズムの出力をもとに、GNU diff / `git diff` 互換の
 * Unified Diff フォーマット文字列を生成する。
 */

import { computeLineDiff, type DiffItem } from "./diff.ts";

export interface UnifiedDiffOptions {
  /** 変更前（左側）の表示ラベル/パス。省略時は "a/left" */
  leftLabel?: string;
  /** 変更後（右側）の表示ラベル/パス。省略時は "b/right" */
  rightLabel?: string;
  /** コンテキスト行数（既定: 3） */
  contextLines?: number;
  /** Git ヘッダ (`diff --git a/... b/...`) を含めるかどうか */
  gitHeader?: boolean;
}

interface UnifiedHunk {
  leftStart: number;
  leftCount: number;
  rightStart: number;
  rightCount: number;
  lines: string[];
}

/**
 * 改行コードを正規化して行配列と末尾改行フラグに分解する。
 */
function toCleanLines(
  text: string,
): { lines: string[]; hasTrailingNewline: boolean } {
  if (text.length === 0) {
    return { lines: [], hasTrailingNewline: false };
  }
  const hasTrailingNewline = text.endsWith("\n");
  let content = text;
  if (hasTrailingNewline) {
    content = text.endsWith("\r\n") ? text.slice(0, -2) : text.slice(0, -1);
  }
  return {
    lines: content.length > 0 ? content.split(/\r?\n/) : [""],
    hasTrailingNewline,
  };
}

/**
 * 2 つのテキストから Unified Diff 形式の文字列を生成する。
 * 差分がない場合は空文字列 `""` を返す。
 */
export function formatUnifiedDiff(
  leftContent: string,
  rightContent: string,
  options?: UnifiedDiffOptions,
): string {
  if (leftContent === rightContent) {
    return "";
  }

  const leftLabel = options?.leftLabel ?? "a/left";
  const rightLabel = options?.rightLabel ?? "b/right";
  const contextLines = options?.contextLines ?? 3;

  const leftParsed = toCleanLines(leftContent);
  const rightParsed = toCleanLines(rightContent);

  const diffItems = computeLineDiff(leftParsed.lines, rightParsed.lines);
  if (
    diffItems.length === 0 || diffItems.every((item) => item.op === "equal")
  ) {
    return "";
  }

  const hunks = groupIntoUnifiedHunks(
    diffItems,
    leftParsed.lines.length,
    rightParsed.lines.length,
    contextLines,
    leftParsed.hasTrailingNewline,
    rightParsed.hasTrailingNewline,
  );
  if (hunks.length === 0) {
    return "";
  }

  const output: string[] = [];

  if (options?.gitHeader) {
    output.push(
      `diff --git a/${leftLabel.replace(/^[ab]\//, "")} b/${
        rightLabel.replace(/^[ab]\//, "")
      }`,
    );
  }

  output.push(`--- ${leftLabel}`);
  output.push(`+++ ${rightLabel}`);

  for (const hunk of hunks) {
    const leftRange = formatRange(hunk.leftStart, hunk.leftCount);
    const rightRange = formatRange(hunk.rightStart, hunk.rightCount);
    output.push(`@@ -${leftRange} +${rightRange} @@`);
    output.push(...hunk.lines);
  }

  return output.join("\n") + "\n";
}

/**
 * Unified Diff の行範囲 (start,count) をフォーマットする。
 * 行数 1 の場合は省略する（GNU diff / git diff 互換）。
 */
function formatRange(start: number, count: number): string {
  if (count === 1) {
    return `${start}`;
  }
  return `${start},${count}`;
}

/**
 * DiffItem[] からコンテキスト行を考慮した UnifiedHunk のリストを抽出する。
 */
function groupIntoUnifiedHunks(
  diffItems: DiffItem[],
  totalLeft: number,
  totalRight: number,
  contextLines: number,
  leftHasNewline: boolean,
  rightHasNewline: boolean,
): UnifiedHunk[] {
  // 1. 各 DiffItem の Left/Right 行番号と変更フラグを整理
  interface AnnotatedItem {
    item: DiffItem;
    leftNo: number;
    rightNo: number;
  }

  const items: AnnotatedItem[] = [];
  let curLeft = 1;
  let curRight = 1;

  for (const it of diffItems) {
    if (it.op === "equal") {
      items.push({ item: it, leftNo: curLeft, rightNo: curRight });
      curLeft++;
      curRight++;
    } else if (it.op === "delete") {
      items.push({ item: it, leftNo: curLeft, rightNo: curRight });
      curLeft++;
    } else if (it.op === "insert") {
      items.push({ item: it, leftNo: curLeft, rightNo: curRight });
      curRight++;
    }
  }

  // 2. 変更があるインデックスを特定
  const changeIndices: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].item.op !== "equal") {
      changeIndices.push(i);
    }
  }

  if (changeIndices.length === 0) {
    return [];
  }

  // 3. コンテキスト範囲を結合して Hunk 範囲 [startIdx, endIdx] を決定
  const hunkRanges: [number, number][] = [];
  let curStart = Math.max(0, changeIndices[0] - contextLines);
  let curEnd = Math.min(items.length - 1, changeIndices[0] + contextLines);

  for (let c = 1; c < changeIndices.length; c++) {
    const idx = changeIndices[c];
    const nextStart = Math.max(0, idx - contextLines);
    const nextEnd = Math.min(items.length - 1, idx + contextLines);

    if (nextStart <= curEnd + 1) {
      // 直前の Hunk 範囲と重なるか隣接している場合はマージ
      curEnd = Math.max(curEnd, nextEnd);
    } else {
      hunkRanges.push([curStart, curEnd]);
      curStart = nextStart;
      curEnd = nextEnd;
    }
  }
  hunkRanges.push([curStart, curEnd]);

  // 4. 各 Hunk 範囲から UnifiedHunk を構築
  const result: UnifiedHunk[] = [];

  for (const [startIdx, endIdx] of hunkRanges) {
    const slice = items.slice(startIdx, endIdx + 1);

    let leftStart = 0;
    let leftCount = 0;
    let rightStart = 0;
    let rightCount = 0;
    const lines: string[] = [];

    let first = true;
    for (let i = 0; i < slice.length; i++) {
      const { item, leftNo, rightNo } = slice[i];
      if (first) {
        leftStart = item.op === "insert" ? (leftNo > 0 ? leftNo : 1) : leftNo;
        rightStart = item.op === "delete"
          ? (rightNo > 0 ? rightNo : 1)
          : rightNo;
        first = false;
      }

      if (item.op === "equal") {
        leftCount++;
        rightCount++;
        lines.push(` ${item.line}`);
        if (
          !leftHasNewline && leftNo === totalLeft && !rightHasNewline &&
          rightNo === totalRight
        ) {
          lines.push("\\ No newline at end of file");
        }
      } else if (item.op === "delete") {
        leftCount++;
        lines.push(`-${item.line}`);
        if (!leftHasNewline && leftNo === totalLeft) {
          lines.push("\\ No newline at end of file");
        }
      } else if (item.op === "insert") {
        rightCount++;
        lines.push(`+${item.line}`);
        if (!rightHasNewline && rightNo === totalRight) {
          lines.push("\\ No newline at end of file");
        }
      }
    }

    // 削除のみ / 挿入のみの境界開始行調整
    if (leftCount === 0) {
      leftStart = Math.max(0, leftStart - 1);
    }
    if (rightCount === 0) {
      rightStart = Math.max(0, rightStart - 1);
    }

    result.push({
      leftStart,
      leftCount,
      rightStart,
      rightCount,
      lines,
    });
  }

  return result;
}

/**
 * 2 つのディレクトリを比較し、差分のある全ファイルの Unified Diff を連結して生成する。
 */
export async function formatDirectoryUnifiedDiff(
  leftDir: string,
  rightDir: string,
  options?: UnifiedDiffOptions,
): Promise<string> {
  const { join } = await import("@std/path");
  const { compareFilePair, scanDirectoryEntries } = await import(
    "./dir_diff.ts"
  );
  const [leftMap, rightMap] = await Promise.all([
    scanDirectoryEntries(leftDir),
    scanDirectoryEntries(rightDir),
  ]);

  const allKeys = Array.from(
    new Set([...leftMap.keys(), ...rightMap.keys()]),
  ).sort();

  const diffs: string[] = [];

  for (const relPath of allKeys) {
    const leftEntry = leftMap.get(relPath);
    const rightEntry = rightMap.get(relPath);

    if (leftEntry?.isDir || rightEntry?.isDir) continue;

    const leftFull = leftEntry ? join(leftDir, relPath) : null;
    const rightFull = rightEntry ? join(rightDir, relPath) : null;

    const { status, isBinary } = await compareFilePair(
      leftFull,
      rightFull,
      leftEntry,
      rightEntry,
    );

    if (status === "identical" || isBinary) continue;

    let leftContent = "";
    let rightContent = "";

    if (status === "modified") {
      try {
        [leftContent, rightContent] = await Promise.all([
          Deno.readTextFile(leftFull!),
          Deno.readTextFile(rightFull!),
        ]);
      } catch {
        continue;
      }
    } else if (status === "added") {
      try {
        rightContent = await Deno.readTextFile(rightFull!);
      } catch {
        continue;
      }
    } else if (status === "deleted") {
      try {
        leftContent = await Deno.readTextFile(leftFull!);
      } catch {
        continue;
      }
    }

    const diff = formatUnifiedDiff(leftContent, rightContent, {
      leftLabel: `a/${relPath}`,
      rightLabel: `b/${relPath}`,
      contextLines: options?.contextLines,
      gitHeader: true,
    });

    if (diff) {
      diffs.push(diff);
    }
  }

  return diffs.join("\n");
}
