/**
 * DiffSessionData の組み立て処理（P1-08, B-2）。
 */

import type { ParsedCliArgs } from "../cli/args.ts";
import { analyzeDiff, analyzeDiffAsync } from "./analysis/index.ts";
import { diffCsv } from "./structured/csv_parser.ts";
import { isSemanticallyEqualJson } from "./structured/json_canonicalizer.ts";
import { isSemanticallyEqualYaml } from "./structured/yaml_canonicalizer.ts";
import { computeThreeWayDiff } from "./three_way.ts";
import type {
  DiffMode,
  DiffSessionData,
  FileTarget,
  ImageDiffSessionData,
  ThreeWaySessionInfo,
} from "./types.ts";

export interface BuildSessionParams {
  args: ParsedCliArgs;
  left: FileTarget;
  right: FileTarget;
  base?: FileTarget;
  threeWayInfo?: ThreeWaySessionInfo;
  imageSession?: ImageDiffSessionData;
}

/**
 * CLI 引数と読み込んだファイル情報から `DiffSessionData` を生成する（非同期版、AST セマンティック Diff 対応）。
 */
export async function buildSessionAsync(
  params: BuildSessionParams,
): Promise<DiffSessionData> {
  const { args, left, right, base, threeWayInfo, imageSession } = params;
  let mode: DiffMode = args.mode === "3way" ? "3way" : "2way";

  if (imageSession) {
    mode = "image";
  } else if (
    (left.path.toLowerCase().endsWith(".csv") &&
      right.path.toLowerCase().endsWith(".csv")) ||
    (left.path.toLowerCase().endsWith(".tsv") &&
      right.path.toLowerCase().endsWith(".tsv"))
  ) {
    mode = "csv";
  }

  const aiContext = args.prompt !== undefined || args.agent !== undefined ||
      args.model !== undefined
    ? {
      prompt: args.prompt,
      agent: args.agent,
      model: args.model,
    }
    : undefined;

  let threeWay: ThreeWaySessionInfo | undefined = threeWayInfo;
  if (mode === "3way" && !threeWay && base) {
    const threeWayRes = computeThreeWayDiff(
      base.content,
      left.content,
      right.content,
    );
    threeWay = {
      hunks: threeWayRes.hunks,
      initialMergedContent: threeWayRes.initialMergedContent,
      conflictCount: threeWayRes.conflictCount,
    };
  }

  const hunks = await analyzeDiffAsync(left.content, right.content, {
    ignoreSpace: args.ignoreSpace,
    ignoreComments: args.ignoreComments,
    filename: right.path || left.path,
  });

  // JSON / YAML セマンティック等価判定（キー順序のみの違いなら全 hunk を noise 化）
  const isJson = left.path.toLowerCase().endsWith(".json") &&
    right.path.toLowerCase().endsWith(".json");
  const isYaml = (left.path.toLowerCase().endsWith(".yaml") ||
    left.path.toLowerCase().endsWith(".yml")) &&
    (right.path.toLowerCase().endsWith(".yaml") ||
      right.path.toLowerCase().endsWith(".yml"));

  if (isJson && isSemanticallyEqualJson(left.content, right.content)) {
    for (const hunk of hunks) {
      hunk.isNoise = true;
      hunk.summaryTag = "[Format] Key reordering";
    }
  } else if (isYaml && isSemanticallyEqualYaml(left.content, right.content)) {
    for (const hunk of hunks) {
      hunk.isNoise = true;
      hunk.summaryTag = "[Format] Key reordering";
    }
  }

  // CSV 差分データ生成
  const csvDiff = mode === "csv"
    ? diffCsv(
      left.content,
      right.content,
      left.path.toLowerCase().endsWith(".tsv") ? "\t" : ",",
    )
    : undefined;

  return {
    sessionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    mode,
    aiContext,
    files: {
      left,
      right,
      base,
    },
    outputPath: args.output,
    hunks,
    threeWay,
    imageSession,
    csvDiff,
    options: {
      ignoreSpace: args.ignoreSpace,
      ignoreComments: args.ignoreComments,
    },
  };
}

/**
 * CLI 引数と読み込んだファイル情報から `DiffSessionData` を生成する（同期版）。
 */
export function buildSession(params: BuildSessionParams): DiffSessionData {
  const { args, left, right, base, threeWayInfo, imageSession } = params;
  let mode: DiffMode = args.mode === "3way" ? "3way" : "2way";

  if (imageSession) {
    mode = "image";
  } else if (
    (left.path.toLowerCase().endsWith(".csv") &&
      right.path.toLowerCase().endsWith(".csv")) ||
    (left.path.toLowerCase().endsWith(".tsv") &&
      right.path.toLowerCase().endsWith(".tsv"))
  ) {
    mode = "csv";
  }

  const aiContext = args.prompt !== undefined || args.agent !== undefined ||
      args.model !== undefined
    ? {
      prompt: args.prompt,
      agent: args.agent,
      model: args.model,
    }
    : undefined;

  let threeWay: ThreeWaySessionInfo | undefined = threeWayInfo;
  if (mode === "3way" && !threeWay && base) {
    const threeWayRes = computeThreeWayDiff(
      base.content,
      left.content,
      right.content,
    );
    threeWay = {
      hunks: threeWayRes.hunks,
      initialMergedContent: threeWayRes.initialMergedContent,
      conflictCount: threeWayRes.conflictCount,
    };
  }

  const hunks = analyzeDiff(left.content, right.content, {
    ignoreSpace: args.ignoreSpace,
    ignoreComments: args.ignoreComments,
    filename: right.path || left.path,
  });

  // JSON / YAML セマンティック等価判定（キー順序のみの違いなら全 hunk を noise 化）
  const isJson = left.path.toLowerCase().endsWith(".json") &&
    right.path.toLowerCase().endsWith(".json");
  const isYaml = (left.path.toLowerCase().endsWith(".yaml") ||
    left.path.toLowerCase().endsWith(".yml")) &&
    (right.path.toLowerCase().endsWith(".yaml") ||
      right.path.toLowerCase().endsWith(".yml"));

  if (isJson && isSemanticallyEqualJson(left.content, right.content)) {
    for (const hunk of hunks) {
      hunk.isNoise = true;
      hunk.summaryTag = "[Format] Key reordering";
    }
  } else if (isYaml && isSemanticallyEqualYaml(left.content, right.content)) {
    for (const hunk of hunks) {
      hunk.isNoise = true;
      hunk.summaryTag = "[Format] Key reordering";
    }
  }

  // CSV 差分データ生成
  const csvDiff = mode === "csv"
    ? diffCsv(
      left.content,
      right.content,
      left.path.toLowerCase().endsWith(".tsv") ? "\t" : ",",
    )
    : undefined;

  return {
    sessionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    mode,
    aiContext,
    files: {
      left,
      right,
      base,
    },
    outputPath: args.output,
    hunks,
    threeWay,
    imageSession,
    csvDiff,
    options: {
      ignoreSpace: args.ignoreSpace,
      ignoreComments: args.ignoreComments,
    },
  };
}
