/**
 * ブランチ・コミット指定時の一時 Worktree 自動作成およびライフサイクル管理（B7-05）。
 */

import { runGitCommand } from "./exec.ts";

export interface TempWorktree {
  path: string;
  ref: string;
  repoPath: string;
  commitHash?: string;
  cleanup: () => Promise<void>;
}

const activeTempWorktrees = new Set<TempWorktree>();

function normalizeWtPath(p: string): string {
  const norm = p.replace(/[/\\]+$/, "").replace(/\\/g, "/");
  return Deno.build.os === "windows" ? norm.toLowerCase() : norm;
}

/**
 * 指定 ref のコミットハッシュを取得する。
 */
export async function getGitCommitHash(
  repoPath: string,
  ref = "HEAD",
): Promise<string | null> {
  const res = await runGitCommand(["rev-parse", ref], repoPath);
  if (res.code === 0) {
    return res.stdout.trim();
  }
  return null;
}

/**
 * パスからアクティブな TempWorktree を取得する。
 */
export function getActiveTempWorktreeByPath(
  path: string,
): TempWorktree | undefined {
  const target = normalizeWtPath(path);
  for (const wt of activeTempWorktrees) {
    if (normalizeWtPath(wt.path) === target) {
      return wt;
    }
  }
  return undefined;
}

/**
 * 同一リポジトリ・同一 ref・同一コミットの再利用可能な一時 Worktree を検索する。
 */
export function findReusableTempWorktree(
  repoPath: string,
  ref: string,
  commitHash?: string | null,
): TempWorktree | undefined {
  const targetRepo = normalizeWtPath(repoPath);
  for (const wt of activeTempWorktrees) {
    if (
      normalizeWtPath(wt.repoPath) === targetRepo &&
      wt.ref === ref &&
      (!commitHash || !wt.commitHash || wt.commitHash === commitHash)
    ) {
      try {
        const stat = Deno.statSync(wt.path);
        if (stat.isDirectory) {
          return wt;
        }
      } catch {
        activeTempWorktrees.delete(wt);
      }
    }
  }
  return undefined;
}

/**
 * 指定ブランチまたはコミットのチェックアウト用の一時 Worktree を作成する。
 */
export async function createTempWorktree(
  repoPath: string,
  ref: string,
  commitHash?: string,
): Promise<TempWorktree> {
  const hash = commitHash ?? (await getGitCommitHash(repoPath, ref));
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex-wt-" });

  try {
    const res = await runGitCommand(
      ["worktree", "add", "--detach", tempDir, ref],
      repoPath,
    );

    if (res.code !== 0) {
      const errText = res.stderr;
      // 一時ディレクトリを削除
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // ignore
      }
      throw new Error(
        `Failed to create temporary worktree for '${ref}': ${errText.trim()}`,
      );
    }
  } catch (err) {
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // ignore
    }
    throw err;
  }

  let isCleanedUp = false;
  const tempWorktree: TempWorktree = {
    path: tempDir,
    ref,
    repoPath,
    commitHash: hash ?? undefined,
    cleanup: async () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      activeTempWorktrees.delete(tempWorktree);

      try {
        await runGitCommand(
          ["worktree", "remove", "--force", tempDir],
          repoPath,
        );
      } catch {
        // ignore
      }

      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // ignore
      }

      try {
        await runGitCommand(["worktree", "prune"], repoPath);
      } catch {
        // ignore
      }
    },
  };

  activeTempWorktrees.add(tempWorktree);
  return tempWorktree;
}

/**
 * 既存の一時 Worktree が利用可能であれば再利用し、必要なら破棄・新規作成する。
 */
export async function getOrCreateTempWorktree(
  repoPath: string,
  ref: string,
  existingPath?: string,
): Promise<TempWorktree> {
  const currentCommit = await getGitCommitHash(repoPath, ref);

  if (existingPath) {
    const existing = getActiveTempWorktreeByPath(existingPath);
    if (
      existing &&
      normalizeWtPath(existing.repoPath) === normalizeWtPath(repoPath) &&
      existing.ref === ref &&
      (!currentCommit || !existing.commitHash ||
        existing.commitHash === currentCommit)
    ) {
      try {
        if (Deno.statSync(existing.path).isDirectory) {
          return existing;
        }
      } catch {
        // ディレクトリが存在しない場合は破棄
      }
    }
    // 既存の Worktree が一致しない、またはコミットが進んだ場合は安全に破棄
    await cleanupTempWorktreeByPath(existingPath);
  }

  // 他に再利用可能なアクティブ Worktree があるか確認
  const reusable = findReusableTempWorktree(repoPath, ref, currentCommit);
  if (reusable) {
    return reusable;
  }

  return await createTempWorktree(repoPath, ref, currentCommit ?? undefined);
}

/**
 * パスを指定して特定の一時 Worktree を安全に破棄する。
 */
export async function cleanupTempWorktreeByPath(path: string): Promise<void> {
  const target = normalizeWtPath(path);
  for (const wt of Array.from(activeTempWorktrees)) {
    if (normalizeWtPath(wt.path) === target) {
      await wt.cleanup();
      break;
    }
  }
}

/**
 * 登録されているすべての一時 Worktree を安全に破棄する。
 */
export async function cleanupAllTempWorktrees(): Promise<void> {
  const worktrees = Array.from(activeTempWorktrees);
  for (const wt of worktrees) {
    try {
      await wt.cleanup();
    } catch {
      // ignore
    }
  }
}

// プロセス終了時に一時 Worktree をクリーンアップ
if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("unload", () => {
    // 同期・非同期のベストエフォートクリーンアップ
    for (const wt of activeTempWorktrees) {
      try {
        Deno.removeSync(wt.path, { recursive: true });
      } catch {
        // ignore
      }
    }
  });
}
