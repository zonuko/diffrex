/**
 * Git リポジトリおよび Worktree の検出・一覧取得ロジック（B7-01）。
 */

import { isAbsolute, join, normalize } from "@std/path";
import type { GitWorktreeInfo } from "../types.ts";

/**
 * 指定されたディレクトリが Git リポジトリまたは Worktree であるかを判定する。
 * - `.git` ディレクトリが存在する場合（通常リポジトリ / メイン Worktree）
 * - `.git` ファイルが存在し、`gitdir:` が記載されている場合（リンクド Worktree / サブモジュール）
 */
export async function isGitRepository(dirPath: string): Promise<boolean> {
  try {
    const gitPath = join(dirPath, ".git");
    const stat = await Deno.stat(gitPath);
    if (stat.isDirectory) {
      return true;
    }
    if (stat.isFile) {
      const content = await Deno.readTextFile(gitPath);
      return /^gitdir:\s*.+$/m.test(content.trim());
    }
  } catch {
    // ディレクトリが存在しない、アクセス権限がない等
  }
  return false;
}

/**
 * Git の実体ディレクトリ（.git）のパスを解決する。
 */
export async function resolveGitDir(
  targetPath: string,
): Promise<string | null> {
  try {
    const gitPath = join(targetPath, ".git");
    const stat = await Deno.stat(gitPath);
    if (stat.isDirectory) {
      return normalize(gitPath);
    }
    if (stat.isFile) {
      const content = await Deno.readTextFile(gitPath);
      const match = content.match(/^gitdir:\s*(.+)$/m);
      if (match) {
        const rawGitDir = match[1].trim();
        return isAbsolute(rawGitDir)
          ? normalize(rawGitDir)
          : normalize(join(targetPath, rawGitDir));
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * `git worktree list --porcelain` の出力をパースする。
 */
export function parseWorktreeListPorcelain(
  output: string,
  currentRepoPath?: string,
): GitWorktreeInfo[] {
  const lines = output.split(/\r?\n/);
  const worktrees: GitWorktreeInfo[] = [];
  let current: Partial<GitWorktreeInfo> | null = null;

  const normalizedCurrent = currentRepoPath
    ? normalize(currentRepoPath).replace(/\\/g, "/").toLowerCase()
    : null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current && current.path) {
        if (normalizedCurrent) {
          const normPath = normalize(current.path).replace(/\\/g, "/")
            .toLowerCase();
          current.isCurrent = normPath === normalizedCurrent;
        }
        worktrees.push(current as GitWorktreeInfo);
      }
      current = null;
      continue;
    }

    if (trimmed.startsWith("worktree ")) {
      if (current && current.path) {
        if (normalizedCurrent) {
          const normPath = normalize(current.path).replace(/\\/g, "/")
            .toLowerCase();
          current.isCurrent = normPath === normalizedCurrent;
        }
        worktrees.push(current as GitWorktreeInfo);
      }
      current = {
        path: normalize(trimmed.substring(9).trim()),
        head: "",
        isCurrent: false,
      };
    } else if (current) {
      if (trimmed.startsWith("HEAD ")) {
        current.head = trimmed.substring(5).trim();
      } else if (trimmed.startsWith("branch ")) {
        const rawBranch = trimmed.substring(7).trim();
        current.branch = rawBranch.replace(/^refs\/heads\//, "");
      } else if (trimmed === "bare") {
        current.bare = true;
      }
    }
  }

  if (current && current.path) {
    if (normalizedCurrent) {
      const normPath = normalize(current.path).replace(/\\/g, "/")
        .toLowerCase();
      current.isCurrent = normPath === normalizedCurrent;
    }
    worktrees.push(current as GitWorktreeInfo);
  }

  return worktrees;
}

/**
 * リポジトリ内の全 Worktree 一覧を取得する。
 */
export async function listGitWorktrees(
  repoPath: string,
): Promise<GitWorktreeInfo[]> {
  try {
    const cmd = new Deno.Command("git", {
      args: ["worktree", "list", "--porcelain"],
      cwd: repoPath,
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();
    if (output.code === 0) {
      const text = new TextDecoder().decode(output.stdout);
      return parseWorktreeListPorcelain(text, repoPath);
    }
  } catch {
    // git コマンドが存在しないかエラーの場合
  }

  // フォールバック: 現在のリポジトリ単体を返す
  const branch = await getCurrentBranch(repoPath);
  return [
    {
      path: normalize(repoPath),
      head: "HEAD",
      branch: branch ?? undefined,
      isCurrent: true,
    },
  ];
}

/**
 * 現在のチェックアウト中ブランチ名を取得する。
 */
export async function getCurrentBranch(
  repoPath: string,
): Promise<string | null> {
  try {
    const cmd = new Deno.Command("git", {
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      cwd: repoPath,
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();
    if (output.code === 0) {
      const branch = new TextDecoder().decode(output.stdout).trim();
      return branch || null;
    }
  } catch {
    // git コマンド失敗時のフォールバック: .git/HEAD を直接パース
    try {
      const gitDir = await resolveGitDir(repoPath);
      if (gitDir) {
        const headContent = await Deno.readTextFile(join(gitDir, "HEAD"));
        const match = headContent.trim().match(/^ref:\s*refs\/heads\/(.+)$/);
        if (match) {
          return match[1].trim();
        }
        return headContent.trim().substring(0, 7);
      }
    } catch {
      // ignore
    }
  }
  return null;
}
