/**
 * 3-Way 差分・競合判定および自動マージエンジン (B4-01-B)。
 *
 * Base (共通祖先) を基準に、Local (Ours) と Remote (Theirs) の変更を比較し、
 * クリーンマージ（非競合）とコンフリクト（競合）を判定する。
 */

import { computeLineDiff, type DiffItem, splitLines } from "./diff.ts";
import type { ThreeWayHunk, ThreeWaySessionInfo } from "./types.ts";

export interface ThreeWayDiffResult extends ThreeWaySessionInfo {
  cleanMergePossible: boolean;
}

interface BaseSlice {
  baseStart: number; // 0-based
  baseEnd: number; // 0-based exclusive
  baseLines: string[];
  localStart: number;
  localEnd: number;
  localLines: string[];
  remoteStart: number;
  remoteEnd: number;
  remoteLines: string[];
}

/**
 * diff 結果から Base 行に対する各サイドの変更スパンを抽出する
 */
function extractChangesAgainstBase(
  diffItems: DiffItem[],
): Array<{
  baseStart: number;
  baseEnd: number;
  sideLines: string[];
  sideStart: number;
  sideEnd: number;
}> {
  const changes: Array<{
    baseStart: number;
    baseEnd: number;
    sideLines: string[];
    sideStart: number;
    sideEnd: number;
  }> = [];

  let currentBaseIdx = 0; // 0-based
  let currentSideIdx = 0; // 0-based

  let inChange = false;
  let changeBaseStart = 0;
  let changeSideStart = 0;
  let changeSideLines: string[] = [];

  for (const item of diffItems) {
    if (item.op === "equal") {
      if (inChange) {
        changes.push({
          baseStart: changeBaseStart,
          baseEnd: currentBaseIdx,
          sideLines: changeSideLines,
          sideStart: changeSideStart,
          sideEnd: currentSideIdx,
        });
        inChange = false;
        changeSideLines = [];
      }
      currentBaseIdx++;
      currentSideIdx++;
    } else if (item.op === "delete") {
      // Base にあって Side にない
      if (!inChange) {
        inChange = true;
        changeBaseStart = currentBaseIdx;
        changeSideStart = currentSideIdx;
        changeSideLines = [];
      }
      currentBaseIdx++;
    } else if (item.op === "insert") {
      // Side にあって Base にない
      if (!inChange) {
        inChange = true;
        changeBaseStart = currentBaseIdx;
        changeSideStart = currentSideIdx;
        changeSideLines = [];
      }
      changeSideLines.push(item.line);
      currentSideIdx++;
    }
  }

  if (inChange) {
    changes.push({
      baseStart: changeBaseStart,
      baseEnd: currentBaseIdx,
      sideLines: changeSideLines,
      sideStart: changeSideStart,
      sideEnd: currentSideIdx,
    });
  }

  return changes;
}

/**
 * 3-Way 差分・自動マージを実行する。
 */
export function computeThreeWayDiff(
  baseText: string,
  localText: string,
  remoteText: string,
): ThreeWayDiffResult {
  const baseLines = splitLines(baseText);
  const localLines = splitLines(localText);
  const remoteLines = splitLines(remoteText);

  // 1. Base vs Local, Base vs Remote の Myers Diff 計算
  const diffLocal = computeLineDiff(baseLines, localLines);
  const diffRemote = computeLineDiff(baseLines, remoteLines);

  const localChanges = extractChangesAgainstBase(diffLocal);
  const remoteChanges = extractChangesAgainstBase(diffRemote);

  // 2. Base の全領域を走査し、Local / Remote の変更区間をマージしたスライスを作成
  // 変更境界（Base インデックス）をすべて収集
  const boundaries = new Set<number>([0, baseLines.length]);
  for (const c of localChanges) {
    boundaries.add(c.baseStart);
    boundaries.add(c.baseEnd);
  }
  for (const c of remoteChanges) {
    boundaries.add(c.baseStart);
    boundaries.add(c.baseEnd);
  }

  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);
  const slices: BaseSlice[] = [];

  for (let i = 0; i < sortedBoundaries.length - 1; i++) {
    const bStart = sortedBoundaries[i];
    const bEnd = sortedBoundaries[i + 1];

    // この区間に重なる Local 変更を探す
    const lChange = localChanges.find(
      (c) =>
        (c.baseStart <= bStart && c.baseEnd >= bEnd) ||
        (c.baseStart === c.baseEnd && c.baseStart === bStart),
    );
    // この区間に重なる Remote 変更を探す
    const rChange = remoteChanges.find(
      (c) =>
        (c.baseStart <= bStart && c.baseEnd >= bEnd) ||
        (c.baseStart === c.baseEnd && c.baseStart === bStart),
    );

    const bSliceLines = baseLines.slice(bStart, bEnd);

    // Local 側の該当行を決定
    let lSliceLines: string[];
    let lStart = 0;
    let lEnd = 0;
    if (lChange) {
      if (lChange.baseStart === bStart && lChange.baseEnd === bEnd) {
        lSliceLines = lChange.sideLines;
        lStart = lChange.sideStart;
        lEnd = lChange.sideEnd;
      } else {
        // 部分一致の場合は差分から再計算
        lSliceLines = lChange.sideLines;
        lStart = lChange.sideStart;
        lEnd = lChange.sideEnd;
      }
    } else {
      lSliceLines = bSliceLines;
    }

    // Remote 側の該当行を決定
    let rSliceLines: string[];
    let rStart = 0;
    let rEnd = 0;
    if (rChange) {
      if (rChange.baseStart === bStart && rChange.baseEnd === bEnd) {
        rSliceLines = rChange.sideLines;
        rStart = rChange.sideStart;
        rEnd = rChange.sideEnd;
      } else {
        rSliceLines = rChange.sideLines;
        rStart = rChange.sideStart;
        rEnd = rChange.sideEnd;
      }
    } else {
      rSliceLines = bSliceLines;
    }

    slices.push({
      baseStart: bStart,
      baseEnd: bEnd,
      baseLines: bSliceLines,
      localStart: lStart,
      localEnd: lEnd,
      localLines: lSliceLines,
      remoteStart: rStart,
      remoteEnd: rEnd,
      remoteLines: rSliceLines,
    });
  }

  // 3. 各スライスの状態（clean_local, clean_remote, identical, conflict）を判定
  const hunks: ThreeWayHunk[] = [];
  const mergedOutputLines: string[] = [];
  let conflictCount = 0;
  let hunkIdCounter = 0;

  // Local / Remote の全体行インデックスを追跡
  let currentLocalLine = 1;
  let currentRemoteLine = 1;

  for (const slice of slices) {
    const isBaseEqualLocal = arraysEqual(slice.baseLines, slice.localLines);
    const isBaseEqualRemote = arraysEqual(slice.baseLines, slice.remoteLines);
    const isLocalEqualRemote = arraysEqual(slice.localLines, slice.remoteLines);

    hunkIdCounter++;
    const hunkId = `3way-${hunkIdCounter}`;

    const baseStartLine = slice.baseStart + 1;
    const baseEndLine = slice.baseEnd >= slice.baseStart
      ? slice.baseEnd
      : slice.baseStart;

    const localStartLine = currentLocalLine;
    const localEndLine = currentLocalLine + slice.localLines.length - 1;
    currentLocalLine += slice.localLines.length;

    const remoteStartLine = currentRemoteLine;
    const remoteEndLine = currentRemoteLine + slice.remoteLines.length - 1;
    currentRemoteLine += slice.remoteLines.length;

    if (isBaseEqualLocal && isBaseEqualRemote) {
      // 変更なし（共通テキスト）
      mergedOutputLines.push(...slice.baseLines);
    } else if (!isBaseEqualLocal && isBaseEqualRemote) {
      // Local のみ変更
      hunks.push({
        id: hunkId,
        type: "clean_local",
        baseRange: { start: baseStartLine, end: baseEndLine },
        localRange: {
          start: localStartLine,
          end: Math.max(localStartLine, localEndLine),
        },
        remoteRange: {
          start: remoteStartLine,
          end: Math.max(remoteStartLine, remoteEndLine),
        },
        baseLines: slice.baseLines,
        localLines: slice.localLines,
        remoteLines: slice.remoteLines,
        resolution: "local",
        resolvedLines: slice.localLines,
      });
      mergedOutputLines.push(...slice.localLines);
    } else if (isBaseEqualLocal && !isBaseEqualRemote) {
      // Remote のみ変更
      hunks.push({
        id: hunkId,
        type: "clean_remote",
        baseRange: { start: baseStartLine, end: baseEndLine },
        localRange: {
          start: localStartLine,
          end: Math.max(localStartLine, localEndLine),
        },
        remoteRange: {
          start: remoteStartLine,
          end: Math.max(remoteStartLine, remoteEndLine),
        },
        baseLines: slice.baseLines,
        localLines: slice.localLines,
        remoteLines: slice.remoteLines,
        resolution: "remote",
        resolvedLines: slice.remoteLines,
      });
      mergedOutputLines.push(...slice.remoteLines);
    } else if (isLocalEqualRemote) {
      // 両者が全く同一の変更
      hunks.push({
        id: hunkId,
        type: "identical",
        baseRange: { start: baseStartLine, end: baseEndLine },
        localRange: {
          start: localStartLine,
          end: Math.max(localStartLine, localEndLine),
        },
        remoteRange: {
          start: remoteStartLine,
          end: Math.max(remoteStartLine, remoteEndLine),
        },
        baseLines: slice.baseLines,
        localLines: slice.localLines,
        remoteLines: slice.remoteLines,
        resolution: "local",
        resolvedLines: slice.localLines,
      });
      mergedOutputLines.push(...slice.localLines);
    } else {
      // 競合（Conflict）
      conflictCount++;
      const conflictHunk: ThreeWayHunk = {
        id: hunkId,
        type: "conflict",
        baseRange: { start: baseStartLine, end: baseEndLine },
        localRange: {
          start: localStartLine,
          end: Math.max(localStartLine, localEndLine),
        },
        remoteRange: {
          start: remoteStartLine,
          end: Math.max(remoteStartLine, remoteEndLine),
        },
        baseLines: slice.baseLines,
        localLines: slice.localLines,
        remoteLines: slice.remoteLines,
        resolution: "unresolved",
        // 初期状態では Local を仮置きしつつ、UI上で選択可能にする
        resolvedLines: slice.localLines,
      };
      hunks.push(conflictHunk);
      mergedOutputLines.push(...slice.localLines);
    }
  }

  const eol = baseText.includes("\r\n") || localText.includes("\r\n")
    ? "\r\n"
    : "\n";

  return {
    hunks,
    initialMergedContent: mergedOutputLines.join(eol),
    conflictCount,
    cleanMergePossible: conflictCount === 0,
  };
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
