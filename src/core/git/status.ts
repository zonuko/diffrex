/**
 * 単一 Git リポジトリ / ワーキングツリーの変更ファイル自動検出および Base 取得ロジック（B7-02）。
 */

import { join, normalize } from "@std/path";
import { isBinary } from "../file_io.ts";
import { buildDirectoryTree } from "../dir_diff.ts";
import { isIgnoredWatcherFile } from "../watcher.ts";
import type {
  DirectoryDiffSessionData,
  DirectoryDiffSummary,
  FileDiffStatus,
  GitFileStatus,
  GitSubRepoSummary,
} from "../types.ts";
import { getCurrentBranch, listGitWorktrees } from "./worktree.ts";
import { getOrCreateTempWorktree } from "./temp_worktree.ts";
import { runGitCommand } from "./exec.ts";
import type { SubGitRepoInfo } from "./sub_repos.ts";

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
  const res = await runGitCommand(
    ["status", "--porcelain=v1", "-uall"],
    repoPath,
  );
  if (res.code === 0) {
    return parseGitStatusPorcelain(res.stdout);
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
  const gitPath = relativePath.replace(/\\/g, "/");
  const res = await runGitCommand(["show", `${ref}:${gitPath}`], repoPath);
  if (res.code === 0) {
    return res.stdout;
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
    existingTempWorktreePath?: string;
  } = {},
): Promise<DirectoryDiffSessionData> {
  const normRepo = normalize(repoPath);
  const targetRef = options.branch ?? "HEAD";

  // 一時 Worktree を作成または再利用して HEAD (または指定ブランチ) の実体ファイルツリーを展開する。
  // これによりファイル閲覧時の git.exe 起動（コンソール点滅）をゼロにし、超高速なローカルファイル読込を実現。
  let baseDir = normRepo;
  let tempWorktreePath: string | undefined;
  try {
    const tempWt = await getOrCreateTempWorktree(
      normRepo,
      targetRef,
      options.existingTempWorktreePath,
    );
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

/**
 * 相対パスから最も適合するサブリポジトリを検索する。
 */
export function findSubRepoForPath(
  subRepos: SubGitRepoInfo[],
  relPath: string,
): { subRepo: SubGitRepoInfo; fileRelativeInSubRepo: string } | null {
  const normPath = normalize(relPath).replace(/\\/g, "/");

  // 長い相対パスを持つサブリポジトリから優先してマッチ判定
  const sorted = [...subRepos].sort(
    (a, b) => b.relativePath.length - a.relativePath.length,
  );

  for (const sr of sorted) {
    if (!sr.relativePath) {
      // ルート直下リポジトリ
      continue;
    }
    if (
      normPath === sr.relativePath ||
      normPath.startsWith(sr.relativePath + "/")
    ) {
      const fileRel = normPath === sr.relativePath
        ? ""
        : normPath.substring(sr.relativePath.length + 1);
      return { subRepo: sr, fileRelativeInSubRepo: fileRel };
    }
  }

  // ルート直下リポジトリがあればそれを返す
  const rootRepo = subRepos.find((sr) => sr.relativePath === "");
  if (rootRepo) {
    return { subRepo: rootRepo, fileRelativeInSubRepo: normPath };
  }

  return null;
}

/**
 * 複数 Git サブリポジトリの未コミット差分を集約して DirectoryDiffSessionData を構築する（B13-02）。
 */
export async function buildMultiGitDirectoryDiffSession(
  baseDir: string,
  subRepos: SubGitRepoInfo[],
  options: {
    readOnly?: boolean;
    prompt?: string;
    agent?: string;
    model?: string;
  } = {},
): Promise<DirectoryDiffSessionData> {
  const normBase = normalize(baseDir);

  const overallSummary: DirectoryDiffSummary = {
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
    subRepoPath?: string;
    sizeLeft?: number;
    sizeRight?: number;
  }>();

  const subRepoSummaries: GitSubRepoSummary[] = [];

  for (const repo of subRepos) {
    const repoSummary: DirectoryDiffSummary = {
      total: 0,
      modified: 0,
      added: 0,
      deleted: 0,
      identical: 0,
      binary: 0,
      image: 0,
    };

    const changedFiles = await detectGitChangedFiles(repo.absolutePath);

    for (const entry of changedFiles) {
      repoSummary.total++;
      overallSummary.total++;

      let isBin = false;
      let sizeRight: number | undefined;

      const fullTargetPath = join(repo.absolutePath, entry.relativePath);
      const overallRelPath = repo.relativePath
        ? `${repo.relativePath}/${entry.relativePath}`
        : entry.relativePath;

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
      repoSummary[finalStatus]++;
      overallSummary[finalStatus]++;

      resultMap.set(overallRelPath, {
        isDir: false,
        status: finalStatus,
        gitStatus: entry.gitStatus,
        subRepoPath: repo.relativePath,
        sizeRight,
      });
    }

    subRepoSummaries.push({
      name: repo.name,
      relativePath: repo.relativePath,
      absolutePath: repo.absolutePath,
      branch: repo.branch,
      headCommit: repo.headCommit,
      isSubmodule: repo.isSubmodule,
      summary: repoSummary,
    });
  }

  const tree = buildDirectoryTree(resultMap);

  // leaf ノードに gitStatus と subRepoPath を設定
  const applyMetadata = (node: import("../types.ts").DirectoryTreeNode) => {
    if (!node.isDir) {
      const entry = resultMap.get(node.relativePath);
      if (entry) {
        node.gitStatus = entry.gitStatus;
        node.subRepoPath = entry.subRepoPath;
      }
    } else if (node.children) {
      for (const child of node.children) {
        applyMetadata(child);
      }
    }
  };
  applyMetadata(tree);

  // ルートリポジトリがあればそのブランチ、なければ最初のサブリポジトリのブランチ
  const rootRepo = subRepos.find((r) => r.relativePath === "");
  const defaultBranch = rootRepo?.branch ?? subRepos[0]?.branch;

  return {
    sessionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    mode: "directory",
    baseDir: normBase,
    targetDir: normBase,
    readOnly: options.readOnly ?? false,
    tree,
    summary: overallSummary,
    isGitRepo: true,
    git: {
      isGitRepo: true,
      branch: defaultBranch,
      subRepos: subRepoSummaries,
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

export interface GitDiffNoIndexEntry {
  relativePath: string;
  status: FileDiffStatus;
  gitStatus: GitFileStatus;
  origPath?: string;
}

/**
 * `git diff --no-index --name-status <baseDir> <targetDir>` の出力をパースする。
 */
export function parseGitDiffNoIndexOutput(
  output: string,
  baseDir: string,
  targetDir: string,
): GitDiffNoIndexEntry[] {
  const lines = output.split(/\r?\n/);
  const entries: GitDiffNoIndexEntry[] = [];

  const normBase = normalize(baseDir).replace(/\\/g, "/").replace(/\/+$/, "") +
    "/";
  const normTarget =
    normalize(targetDir).replace(/\\/g, "/").replace(/\/+$/, "") + "/";
  const lowerBase = normBase.toLowerCase();
  const lowerTarget = normTarget.toLowerCase();

  const stripPrefix = (rawPath: string): string => {
    let p = unquoteGitPath(rawPath).replace(/\\/g, "/");
    const lowerP = p.toLowerCase();
    if (lowerP.startsWith(lowerBase)) {
      p = p.slice(normBase.length);
    } else if (lowerP.startsWith(lowerTarget)) {
      p = p.slice(normTarget.length);
    }
    return p.replace(/^[/\\]+/, "");
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // warning: ... など Git の警告・エラー行をスキップ
    if (trimmed.startsWith("warning:") || trimmed.startsWith("error:")) {
      continue;
    }

    const parts = trimmed.split("\t");
    if (parts.length < 2) continue;

    const statusCode = parts[0].trim();
    const statusChar = statusCode[0];

    if (statusChar === "R" || statusChar === "C") {
      if (parts.length >= 3) {
        const origPath = stripPrefix(parts[1]);
        const newPath = stripPrefix(parts[2]);
        if (
          isIgnoredWatcherFile(newPath) ||
          newPath === ".git" ||
          newPath.startsWith(".git/")
        ) {
          continue;
        }
        entries.push({
          relativePath: newPath,
          origPath,
          status: "modified",
          gitStatus: "R",
        });
      }
      continue;
    }

    const relPath = stripPrefix(parts[1]);
    if (
      isIgnoredWatcherFile(relPath) ||
      relPath === ".git" ||
      relPath.startsWith(".git/")
    ) {
      continue;
    }

    if (statusChar === "A") {
      entries.push({
        relativePath: relPath,
        status: "added",
        gitStatus: "A",
      });
    } else if (statusChar === "D") {
      entries.push({
        relativePath: relPath,
        status: "deleted",
        gitStatus: "D",
      });
    } else {
      // "M", "T" 等
      entries.push({
        relativePath: relPath,
        status: "modified",
        gitStatus: "M",
      });
    }
  }

  return entries;
}

/**
 * 2つの Git Worktree 間の差分を `git diff --no-index --name-status` により高速検出し、
 * DirectoryDiffSessionData を構築する（FIX-06）。
 */
export async function buildGitWorktreeDiffSession(
  repoPath: string,
  worktreePath: string,
  options: {
    readOnly?: boolean;
    prompt?: string;
    agent?: string;
    model?: string;
  } = {},
): Promise<DirectoryDiffSessionData> {
  const normRepo = normalize(repoPath);
  const normWorktree = normalize(worktreePath);

  // Worktree 一覧とブランチ情報を取得
  const [worktrees, currentBranch] = await Promise.all([
    listGitWorktrees(normRepo),
    getCurrentBranch(normRepo),
  ]);

  const normBaseTarget = normalize(normWorktree).replace(/\\/g, "/")
    .toLowerCase();
  const matchedWt = worktrees.find((wt) =>
    normalize(wt.path).replace(/\\/g, "/").toLowerCase() === normBaseTarget
  );
  const wtBranch = matchedWt?.branch;

  // git diff --no-index --name-status で変更ファイル一覧を高速取得
  let changedEntries: GitDiffNoIndexEntry[] = [];
  try {
    const res = await runGitCommand(
      [
        "-c",
        "core.quotepath=false",
        "diff",
        "--no-index",
        "--name-status",
        normWorktree,
        normRepo,
      ],
      normRepo,
    );
    // git diff は差分ありで code 1, 差分なしで code 0 を返す
    if (res.code === 0 || res.code === 1) {
      changedEntries = parseGitDiffNoIndexOutput(
        res.stdout,
        normWorktree,
        normRepo,
      );
    }
  } catch (err) {
    console.warn("Failed to run git diff --no-index for worktree:", err);
  }

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

  for (const entry of changedEntries) {
    summary.total++;

    let isBin = false;
    let sizeLeft: number | undefined;
    let sizeRight: number | undefined;

    const fullTargetPath = join(normRepo, entry.relativePath);
    const fullBasePath = join(normWorktree, entry.relativePath);

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
    baseDir: normWorktree,
    targetDir: normRepo,
    readOnly: options.readOnly ?? false,
    tree,
    summary,
    isGitRepo: true,
    git: {
      isGitRepo: true,
      branch: wtBranch ?? currentBranch ?? undefined,
      worktrees,
      isWorktreeComparison: true,
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
