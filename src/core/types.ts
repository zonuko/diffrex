/**
 * Diffrex の共通型定義。
 *
 * 仕様書 `docs/AI-FriendlyDiffToolSpecification.md` 5章「Data Models &
 * TypeScript Definitions」と1対1で対応する。Phase 1 以降の
 * `src/core/session.ts` / `file_io.ts` / `diff.ts` / `analysis/*`、および
 * `src/desktop` / `src/ui` はこの型を参照する。
 */

/** 比較モード。位置引数2個なら `2way` (または画像/CSV判定)、3個なら `3way`、ディレクトリ同士なら `directory`、引数なしなら `welcome`。 */
export type DiffMode =
  | "2way"
  | "3way"
  | "directory"
  | "welcome"
  | "image"
  | "csv"
  | "git-external";

/** 画像比較の対象ファイルデータ。 */
export interface ImageTarget {
  path: string;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

/** 画像比較セッションのデータ。 */
export interface ImageDiffSessionData {
  sessionId: string;
  timestamp: string;
  mode: "image";
  left: ImageTarget;
  right: ImageTarget;
  readOnly: boolean;
  aiContext?: {
    prompt?: string;
    agent?: string;
    model?: string;
  };
}

/** CSV セル差分情報。 */
export interface CsvCellDiff {
  colIndex: number;
  leftValue?: string;
  rightValue?: string;
  status: "identical" | "modified" | "added" | "deleted";
}

/** CSV 行差分情報。 */
export interface CsvRowDiff {
  rowIndex: number;
  status: "identical" | "modified" | "added" | "deleted";
  cells: CsvCellDiff[];
}

/** CSV / TSV 比較データ。 */
export interface CsvDiffData {
  headers: string[];
  rows: CsvRowDiff[];
  totalRowsLeft: number;
  totalRowsRight: number;
  modifiedRowsCount: number;
  addedRowsCount: number;
  deletedRowsCount: number;
}

/** CSV 比較セッションのデータ。 */
export interface CsvDiffSessionData {
  sessionId: string;
  timestamp: string;
  mode: "csv";
  files: {
    left: FileTarget;
    right: FileTarget;
  };
  csvDiff: CsvDiffData;
  readOnly: boolean;
  outputPath?: string;
  aiContext?: {
    prompt?: string;
    agent?: string;
    model?: string;
  };
}

/** ディレクトリ比較における各エントリの差分状態。 */
export type FileDiffStatus =
  | "identical"
  | "modified"
  | "added"
  | "deleted"
  | "binary"
  | "image";

/** ディレクトリツリーの各ノード。 */
export interface DirectoryTreeNode {
  name: string;
  /** ルートからの相対パス（例: "src/app.ts"） */
  relativePath: string;
  isDir: boolean;
  status: FileDiffStatus;
  sizeLeft?: number;
  sizeRight?: number;
  children?: DirectoryTreeNode[];
}

/** ディレクトリ比較の統計サマリ。 */
export interface DirectoryDiffSummary {
  total: number;
  modified: number;
  added: number;
  deleted: number;
  identical: number;
  binary: number;
  image: number;
}

/** ディレクトリ比較セッションのデータ。 */
export interface DirectoryDiffSessionData {
  sessionId: string;
  timestamp: string;
  mode: "directory";
  baseDir: string;
  targetDir: string;
  readOnly: boolean;
  tree: DirectoryTreeNode;
  summary: DirectoryDiffSummary;
  aiContext?: {
    prompt?: string;
    agent?: string;
    model?: string;
  };
}

/** hunk のリスク評価。Deno 側の静的解析で決定する（仕様書6章 B）。 */
export type RiskLevel = "normal" | "warning" | "danger";

/** hunk のレビュー状態。`A` / `R` / `E` のアクションで遷移する。 */
export type HunkStatus = "unreviewed" | "accepted" | "rejected" | "edited";

/** 比較対象となる1ファイル。 */
export interface FileTarget {
  path: string;
  content: string;
  readOnly: boolean;
}

/** コードブロック移動アノテーション情報 */
export interface MoveAnnotation {
  fromLineStart: number;
  fromLineEnd: number;
  toLineStart: number;
  toLineEnd: number;
  nodeName: string;
  nodeType: string;
}

/** diff hunk 1個と、その静的解析結果。 */
export interface HunkAnnotation {
  id: string;
  lineStartLeft: number;
  lineEndLeft: number;
  lineStartRight: number;
  lineEndRight: number;
  /** True if changes are solely indents/comments/whitespace/rename/move */
  isNoise: boolean;
  noiseReason?: "whitespace" | "comment" | "empty" | "rename" | "move";
  /** Evaluated by Deno analysis */
  riskLevel: RiskLevel;
  status: HunkStatus;
  /** e.g., "[Format] Indentation", "[Risk] 15 lines deleted", "[Moved] function foo", "[Rename] x -> y" */
  summaryTag?: string;
  /** ブロック移動情報 */
  moveInfo?: MoveAnnotation;
}

/** 3-Way 競合解決の選択肢 */
export type ConflictResolution =
  | "unresolved"
  | "local"
  | "remote"
  | "base"
  | "both_local_first"
  | "both_remote_first"
  | "custom";

/** 3-Way Hunk の種類 */
export type ThreeWayHunkType =
  | "clean_local" // Local のみ変更（非競合）
  | "clean_remote" // Remote のみ変更（非競合）
  | "identical" // 両者が同一の変更（非競合）
  | "conflict"; // 競合

/** 3-Way Hunk（差分ブロック）情報 */
export interface ThreeWayHunk {
  id: string;
  type: ThreeWayHunkType;
  /** 1-based 行番号範囲（inclusive） */
  baseRange: { start: number; end: number };
  localRange: { start: number; end: number };
  remoteRange: { start: number; end: number };
  baseLines: string[];
  localLines: string[];
  remoteLines: string[];
  resolution: ConflictResolution;
  /** 自動マージまたは解決後のテキスト行 */
  resolvedLines: string[];
}

/** 3-Way セッション詳細情報 */
export interface ThreeWaySessionInfo {
  hunks: ThreeWayHunk[];
  initialMergedContent: string;
  conflictCount: number;
}

/** UI（WebView）へ渡す1セッション分のデータ。 */
export interface DiffSessionData {
  sessionId: string;
  timestamp: string;
  mode: DiffMode;
  aiContext?: {
    prompt?: string;
    agent?: string;
    model?: string;
  };
  files: {
    /** Base / Local (2way では Base, 3way では Local/Mine) */
    left: FileTarget;
    /** Target / Remote (2way では Target, 3way では Remote/Theirs) */
    right: FileTarget;
    /** Optional 3-way parent (Base / Common Ancestor) */
    base?: FileTarget;
  };
  /** Explicit save destination override */
  outputPath?: string;
  hunks: HunkAnnotation[];
  /** 3-Way 比較時の詳細情報 */
  threeWay?: ThreeWaySessionInfo;
  /** 画像比較時の詳細情報 */
  imageSession?: ImageDiffSessionData;
  /** CSV 比較時の詳細情報 */
  csvDiff?: CsvDiffData;
  options: {
    ignoreSpace: boolean;
    ignoreComments: boolean;
  };
}

/** 比較履歴エントリー (B6-03) */
export interface HistoryEntry {
  id: string;
  timestamp: string;
  mode: DiffMode | "directory";
  leftPath: string;
  rightPath: string;
  basePath?: string;
  outputPath?: string;
  prompt?: string;
  agent?: string;
  model?: string;
  readOnly?: boolean;
  totalHunks?: number;
}

/** 自動セッション保存スナップショット (B6-03) */
export interface SessionSnapshot {
  timestamp: string;
  mode: DiffMode | "directory";
  leftPath: string;
  rightPath: string;
  basePath?: string;
  outputPath?: string;
  readOnly?: boolean;
  prompt?: string;
  agent?: string;
  model?: string;
  hunkStatuses?: Record<string, HunkStatus>;
  unsavedRightContent?: string;
}
