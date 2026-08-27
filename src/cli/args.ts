/**
 * Diffrex の CLI 引数パース処理（P1-01）。
 *
 * `@std/cli/parse-args` を用いて CLI 引数を構造化データに変換する。
 */

import { parseArgs } from "@std/cli/parse-args";
import type { DiffMode } from "../core/types.ts";

export interface ParsedCliArgs {
  mode?: DiffMode | "stdin";
  positional: string[];
  left?: string;
  right?: string;
  base?: string;
  gitPath?: string;
  prompt?: string;
  agent?: string;
  model?: string;
  wait: boolean;
  output?: string;
  readOnly: boolean;
  ignoreSpace: boolean;
  ignoreComments: boolean;
  headless: boolean;
  stdout: boolean;
  unified?: number;
  help: boolean;
  version: boolean;
  installContextMenu?: boolean;
  uninstallContextMenu?: boolean;
  generateContextMenuScript?: boolean;
  restore?: boolean;
  clearHistory?: boolean;
}

export interface ParseResultSuccess {
  ok: true;
  parsed: ParsedCliArgs;
}

export interface ParseResultError {
  ok: false;
  error: string;
  exitCode: number; // 2: 引数エラー
}

export type ParseResult = ParseResultSuccess | ParseResultError;

/**
 * CLI 引数をパースする。
 * 未知のフラグが含まれる場合は `ok: false` と `exitCode: 2` を返す。
 */
export function parseCliArgs(args: string[]): ParseResult {
  const unknownFlags: string[] = [];
  // CLI タスク実行時（例: deno task -- ...）に渡される引数区切り '--' を除外
  const cleanArgs = args.filter((a) => a !== "--");

  const parsed = parseArgs(cleanArgs, {
    string: ["prompt", "agent", "model", "output", "runtime", "unified", "U"],
    boolean: [
      "wait",
      "read-only",
      "ignore-space",
      "ignore-comments",
      "headless",
      "stdout",
      "help",
      "version",
      "install-context-menu",
      "uninstall-context-menu",
      "generate-context-menu-script",
      "restore",
      "clear-history",
    ],
    alias: {
      w: "wait",
      o: "output",
      h: "help",
      v: "version",
      r: "restore",
      s: "stdout",
      u: "unified",
      U: "unified",
    },
    unknown: (arg: string) => {
      if (arg.startsWith("-") && arg !== "-") {
        unknownFlags.push(arg);
        return false;
      }
      return true;
    },
  });

  if (unknownFlags.length > 0) {
    return {
      ok: false,
      error: `unknown option: '${unknownFlags[0]}'`,
      exitCode: 2,
    };
  }

  const positional = parsed._.map(String);
  const help = Boolean(parsed.help);
  const version = Boolean(parsed.version);
  const wait = Boolean(parsed.wait);
  const readOnly = Boolean(parsed["read-only"]);
  const ignoreSpace = Boolean(parsed["ignore-space"]);
  const ignoreComments = Boolean(parsed["ignore-comments"]);
  const headless = Boolean(parsed.headless);
  const stdout = Boolean(parsed.stdout);
  const unifiedStr = parsed.unified ?? parsed.U;
  const unified = unifiedStr !== undefined ? Number(unifiedStr) : undefined;
  const prompt = parsed.prompt;
  const agent = parsed.agent;
  const model = parsed.model;
  let output = parsed.output;

  let mode: DiffMode | "stdin" | undefined;
  let left: string | undefined;
  let right: string | undefined;
  let base: string | undefined;
  let gitPath: string | undefined;

  if (positional.length === 0) {
    mode = "welcome";
  } else if (positional.length === 1 && positional[0] === "-") {
    mode = "stdin";
    left = "-";
    right = "-";
  } else if (positional.length === 2) {
    mode = "2way"; // validateCliArgs でディレクトリなら "directory" に調整
    left = positional[0];
    right = positional[1];
  } else if (positional.length === 3) {
    mode = "3way";
    left = positional[0]; // local
    base = positional[1]; // base
    right = positional[2]; // remote
    if (!output) {
      output = positional[0]; // default output is <local>
    }
  } else if (positional.length === 7) {
    // Git diff.external 形式: <path> <old-file> <old-hex> <old-mode> <new-file> <new-hex> <new-mode>
    mode = "git-external";
    gitPath = positional[0];
    left = positional[1];
    right = positional[4];
  }

  const installContextMenu = Boolean(parsed["install-context-menu"]);
  const uninstallContextMenu = Boolean(parsed["uninstall-context-menu"]);
  const generateContextMenuScript = Boolean(
    parsed["generate-context-menu-script"],
  );
  const restore = Boolean(parsed.restore);
  const clearHistory = Boolean(parsed["clear-history"]);

  return {
    ok: true,
    parsed: {
      mode,
      positional,
      left,
      right,
      base,
      gitPath,
      prompt,
      agent,
      model,
      wait,
      output,
      readOnly: mode === "stdin" ? true : readOnly,
      ignoreSpace,
      ignoreComments,
      headless,
      stdout,
      unified,
      help,
      version,
      installContextMenu,
      uninstallContextMenu,
      generateContextMenuScript,
      restore,
      clearHistory,
    },
  };
}
