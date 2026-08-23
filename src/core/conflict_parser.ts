/**
 * Git コンフリクトマーカーの検出・パース・テキスト復元モジュール (B4-01-A)。
 *
 * 標準形式 (`<<<<<<<`, `=======`, `>>>>>>>`) および
 * diff3 形式 (`<<<<<<<`, `|||||||`, `=======`, `>>>>>>>`) に対応。
 */

export interface ConflictBlock {
  id: string;
  startLine: number; // 1-based in original conflicted file
  endLine: number; // 1-based in original conflicted file
  localName: string;
  baseName?: string;
  remoteName: string;
  localLines: string[];
  baseLines: string[];
  remoteLines: string[];
}

export interface ParsedConflictFile {
  hasConflicts: boolean;
  localContent: string;
  baseContent: string;
  remoteContent: string;
  conflicts: ConflictBlock[];
}

const CONFLICT_START_REGEX = /^<{7}(?:\s+(.*))?$/;
const CONFLICT_BASE_REGEX = /^\|{7}(?:\s+(.*))?$/;
const CONFLICT_SEP_REGEX = /^={7}$/;
const CONFLICT_END_REGEX = /^>{7}(?:\s+(.*))?$/;

/**
 * テキスト内に Git コンフリクトマーカーが含まれているかを簡易判定する。
 */
export function hasConflictMarkers(text: string): boolean {
  return /^[<]{7}(?:\s+.*)?$/m.test(text) &&
    /^[=]{7}$/m.test(text) &&
    /^[>]{7}(?:\s+.*)?$/m.test(text);
}

/**
 * Git コンフリクトマーカーを含むテキストをパースし、
 * Local / Base / Remote の 3 つのテキストおよび各競合ブロック情報を抽出する。
 */
export function parseConflictMarkers(text: string): ParsedConflictFile {
  const lines = text.split(/\r?\n/);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";

  if (!hasConflictMarkers(text)) {
    return {
      hasConflicts: false,
      localContent: text,
      baseContent: text,
      remoteContent: text,
      conflicts: [],
    };
  }

  const localLinesResult: string[] = [];
  const baseLinesResult: string[] = [];
  const remoteLinesResult: string[] = [];
  const conflicts: ConflictBlock[] = [];

  type ParserState = "normal" | "in_local" | "in_base" | "in_remote";
  let state: ParserState = "normal";

  let currentBlock: Partial<ConflictBlock> | null = null;
  let blockLocalLines: string[] = [];
  let blockBaseLines: string[] = [];
  let blockRemoteLines: string[] = [];
  let conflictIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    if (state === "normal") {
      const match = line.match(CONFLICT_START_REGEX);
      if (match) {
        state = "in_local";
        conflictIndex++;
        currentBlock = {
          id: `conflict-${conflictIndex}`,
          startLine: lineNo,
          localName: (match[1] ?? "LOCAL").trim(),
        };
        blockLocalLines = [];
        blockBaseLines = [];
        blockRemoteLines = [];
      } else {
        localLinesResult.push(line);
        baseLinesResult.push(line);
        remoteLinesResult.push(line);
      }
    } else if (state === "in_local") {
      const baseMatch = line.match(CONFLICT_BASE_REGEX);
      const sepMatch = line.match(CONFLICT_SEP_REGEX);

      if (baseMatch) {
        state = "in_base";
        if (currentBlock) {
          currentBlock.baseName = (baseMatch[1] ?? "BASE").trim();
        }
      } else if (sepMatch) {
        state = "in_remote";
      } else {
        blockLocalLines.push(line);
      }
    } else if (state === "in_base") {
      const sepMatch = line.match(CONFLICT_SEP_REGEX);
      if (sepMatch) {
        state = "in_remote";
      } else {
        blockBaseLines.push(line);
      }
    } else if (state === "in_remote") {
      const endMatch = line.match(CONFLICT_END_REGEX);
      if (endMatch) {
        state = "normal";
        if (currentBlock) {
          const completedBlock: ConflictBlock = {
            id: currentBlock.id!,
            startLine: currentBlock.startLine!,
            endLine: lineNo,
            localName: currentBlock.localName || "LOCAL",
            baseName: currentBlock.baseName,
            remoteName: (endMatch[1] ?? "REMOTE").trim(),
            localLines: [...blockLocalLines],
            baseLines: [...blockBaseLines],
            remoteLines: [...blockRemoteLines],
          };
          conflicts.push(completedBlock);

          // 抽出した各行を各ビューのバッファに追加
          localLinesResult.push(...blockLocalLines);
          // diff3 で base がない場合は、base には local を仮定または空ではなく競合前の共通祖先がないため localLines を用いる
          if (blockBaseLines.length > 0) {
            baseLinesResult.push(...blockBaseLines);
          } else {
            // 標準形式（2-way conflict marker）の場合は baseLines は空または共通推定
            baseLinesResult.push(...blockLocalLines);
          }
          remoteLinesResult.push(...blockRemoteLines);
        }
        currentBlock = null;
      } else {
        blockRemoteLines.push(line);
      }
    }
  }

  // 途中でマーカーが閉じずに終わった場合のリカバリ
  if (state !== "normal" && currentBlock) {
    localLinesResult.push(...blockLocalLines);
    baseLinesResult.push(...blockBaseLines);
    remoteLinesResult.push(...blockRemoteLines);
  }

  return {
    hasConflicts: conflicts.length > 0,
    localContent: localLinesResult.join(eol),
    baseContent: baseLinesResult.join(eol),
    remoteContent: remoteLinesResult.join(eol),
    conflicts,
  };
}

/**
 * ParsedConflictFile から直接 ThreeWaySessionInfo を生成する。
 * （2-Way コンフリクトマーカー等で Base がない場合でも正確にコンフリクトを再現）
 */
export function parsedConflictToThreeWayDiff(
  parsed: ParsedConflictFile,
): {
  hunks: import("./types.ts").ThreeWayHunk[];
  initialMergedContent: string;
  conflictCount: number;
  cleanMergePossible: boolean;
} {
  const hunks: import("./types.ts").ThreeWayHunk[] = [];

  for (let i = 0; i < parsed.conflicts.length; i++) {
    const c = parsed.conflicts[i];
    hunks.push({
      id: `conflict-${i + 1}`,
      type: "conflict",
      baseRange: { start: 1, end: c.baseLines.length || 1 },
      localRange: { start: 1, end: c.localLines.length || 1 },
      remoteRange: { start: 1, end: c.remoteLines.length || 1 },
      baseLines: c.baseLines,
      localLines: c.localLines,
      remoteLines: c.remoteLines,
      resolution: "unresolved",
      resolvedLines: c.localLines,
    });
  }

  return {
    hunks,
    initialMergedContent: parsed.localContent,
    conflictCount: parsed.conflicts.length,
    cleanMergePossible: parsed.conflicts.length === 0,
  };
}
