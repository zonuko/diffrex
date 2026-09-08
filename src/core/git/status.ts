/**
 * 単一 Git リポジトリ / ワーキングツリーの変更ファイル自動検出および Base 取得ロジック（B7-02）。
 */

import { join, normalize } from "@std/path";
import { isBinary } from "../file_io.ts";
import { buildDirectoryTree } from "../dir_diff.ts";
import type {
  DirectoryDiffSessionData,
  DirectoryDiffSummary,
  FileDiffStatus,
  GitFileStatus,
} from "../types.ts";
import { getCurrentBranch, listGitWorktrees } from "./worktree.ts";
import { createTempWorktree } from "./temp_worktree.ts";

export interface GitStatusEntry {
  relativePath: string;
  status: FileDiffStatus;
  gitStatus: GitFileStatus;
  origPath?: string;
  isStaged?: boolean;
}

/**
 * Git の出力するファイルパスの引用符・エスケープを解除する。
 */
function unquoteGitPath(pathStr: string): string {
  let p = pathStr.trim();
  if (p.startsWith('"') && p.endsWith('"')) {
    p = p.substring(1, p.length - 1);
    // 基本的なエスケープシーケンス解除
    p = p.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return normalize(p).replace(/\\/g, "/");
}

/**
 * `git status --porcelain=v1 -uall` の出力をパースする。
 */
export function parseGitStatusPorcelain(output: string): GitStatusEntry[] {
  const lines = output.split(/\r?\n/);
  const entries: GitStatusEntry[] = [];

  for (const line of lines) {
    if (!line || line.length < 3) continue;

    const x = line[0];
    const y = line[1];
    const rest = line.substring(3).trim();

    // 無視されたファイル（!!）は除外
    if (x === "!" && y === "!") continue;

    // 未追跡ファイル（??）
    if (x === "?" && y === "?") {
      const relPath = unquoteGitPath(rest);
      entries.push({
        relativePath: relPath,
        status: "added",
        gitStatus: "?",
      });
      continue;
    }

    // リネーム（R）: "orig -> new"
    if (x === "R" || y === "R") {
      const parts = rest.split(" -> ");
      if (parts.length === 2) {
        const origPath = unquoteGitPath(parts[0]);
        const newPath = unquoteGitPath(parts[1]);
        entries.push({
          relativePath: newPath,
          origPath,
          status: "modified",
          gitStatus: "R",
          isStaged: x === "R",
        });
        continue;
      }
    }

    const relPath = unquoteGitPath(rest);

    // 削除（D）
    if (x === "D" || y === "D") {
      entries.push({
        relativePath: relPath,
        status: "deleted",
        gitStatus: "D",
        isStaged: x === "D" && y === " ",
      });
      continue;
    }

    // 追加（A）
    if (x === "A" && y !== "D") {
      entries.push({
        relativePath: relPath,
        status: "added",
        gitStatus: "A",
        isStaged: true,
      });
      continue;
    }

    // 変更（M またはその他）
    entries.push({
      relativePath: relPath,
      status: "modified",
      gitStatus: "M",
      isStaged: x === "M" && y === " ",
    });
  }

  return entries;
}

/**
 * リポジトリ内の未コミット変更ファイル（Working Tree vs HEAD）を検出する。
 */
export async function detectGitChangedFiles(
  repoPath: string,
): Promise<GitStatusEntry[]> {
  try {
    const cmd = new Deno.Command("git", {
      args: ["status", "--porcelain=v1", "-uall"],
      cwd: repoPath,
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();
    if (output.code === 0) {
      const text = new TextDecoder().decode(output.stdout);
      return parseGitStatusPorcelain(text);
    }
  } catch {
    // git コマンド失敗
  }
  return [];
}

/**
 * Git から指定 ref（デフォルト HEAD）時点のファイル内容を取得する。
 * ファイルが存在しない場合やエラー時は null を返す。
 */
export async function getGitBaseContent(
  repoPath: string,
  relativePath: string,
  ref = "HEAD",
): Promise<string | null> {
  try {
    const gitPath = relativePath.replace(/\\/g, "/");
    const cmd = new Deno.Command("git", {
      args: ["show", `${ref}:${gitPath}`],
      cwd: repoPath,
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();
    if (output.code === 0) {
      return new TextDecoder().decode(output.stdout);
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * 単一 Git リポジトリの未コミット差分から DirectoryDiffSessionData を構築する。
 */
export async function buildGitDirectoryDiffSession(
  repoPath: string,
  options: {
    branch?: string;
    readOnly?: boolean;
    prompt?: string;
    agent?: string;
    model?: string;
  } = {},
): Promise<DirectoryDiffSessionData> {
  const normRepo = normalize(repoPath);
  const targetRef = options.branch ?? "HEAD";

  // 一時 Worktree を作成して HEAD (または指定ブランチ) の実体ファイルツリーを展開する。
  // これによりファイル閲覧時の git.exe 起動（コンソール点滅）をゼロにし、超高速なローカルファイル読込を実現。
  let baseDir = normRepo;
  let tempWorktreePath: string | undefined;
  try {
    const tempWt = await createTempWorktree(normRepo, targetRef);
    baseDir = tempWt.path;
    tempWorktreePath = tempWt.path;
  } catch {
    // 初回コミット前やベアリポジトリなどで worktree 作成に失敗した場合はリポジトリパスにフォールバック
  }

  const changedFiles = await detectGitChangedFiles(normRepo);
  const [currentBranch, worktrees] = await Promise.all([
    getCurrentBranch(normRepo),
    listGitWorktrees(normRepo),
  ]);

  const summary: DirectoryDiffSummary = {
    total: 0,
    modified: 0,
    added: 0,
    deleted: 0,
    identical: 0,
    binary: 0,
    image: 0,
  };

  const resultMap = new Map<string, {
    isDir: boolean;
    status: FileDiffStatus;
    gitStatus?: GitFileStatus;
    sizeLeft?: number;
    sizeRight?: number;
  }>();

  for (const entry of changedFiles) {
    summary.total++;

    let isBin = false;
    let sizeLeft: number | undefined;
    let sizeRight: number | undefined;

    const fullTargetPath = join(normRepo, entry.relativePath);
    const fullBasePath = join(baseDir, entry.relativePath);

    // Base 側のサイズ取得
    if (entry.status !== "added") {
      try {
        const statBase = await Deno.stat(fullBasePath);
        sizeLeft = statBase.size;
      } catch {
        // base stat error
      }
    }

    if (entry.status !== "deleted") {
      try {
        const stat = await Deno.stat(fullTargetPath);
        sizeRight = stat.size;
        const buf = new Uint8Array(Math.min(8000, stat.size));
        const file = await Deno.open(fullTargetPath, { read: true });
        try {
          const n = await file.read(buf);
          if (n && isBinary(buf.subarray(0, n))) {
            isBin = true;
          }
        } finally {
          file.close();
        }
      } catch {
        // stat/read error
      }
    }

    const finalStatus: FileDiffStatus = isBin ? "binary" : entry.status;
    summary[finalStatus]++;

    resultMap.set(entry.relativePath, {
      isDir: false,
      status: finalStatus,
      gitStatus: entry.gitStatus,
      sizeLeft,
      sizeRight,
    });
  }

  const tree = buildDirectoryTree(resultMap);

  // leaf ノードに gitStatus を設定
  const applyGitStatus = (node: import("../types.ts").DirectoryTreeNode) => {
    if (!node.isDir) {
      const entry = resultMap.get(node.relativePath);
      if (entry?.gitStatus) {
        node.gitStatus = entry.gitStatus;
      }
    } else if (node.children) {
      for (const child of node.children) {
        applyGitStatus(child);
      }
    }
  };
  applyGitStatus(tree);

  return {
    sessionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    mode: "directory",
    baseDir,
    targetDir: normRepo,
    readOnly: options.readOnly ?? false,
    tree,
    summary,
    isGitRepo: true,
    git: {
      isGitRepo: true,
      branch: options.branch ?? currentBranch ?? undefined,
      worktrees,
      tempWorktreePath,
    },
    aiContext: (options.prompt || options.agent || options.model)
      ? {
        prompt: options.prompt,
        agent: options.agent,
        model: options.model,
      }
      : undefined,
  };
}
