/**
 * ブランチ・コミット指定時の一時 Worktree 自動作成およびライフサイクル管理（B7-05）。
 */

export interface TempWorktree {
  path: string;
  ref: string;
  repoPath: string;
  cleanup: () => Promise<void>;
}

const activeTempWorktrees = new Set<TempWorktree>();

/**
 * 指定ブランチまたはコミットのチェックアウト用の一時 Worktree を作成する。
 */
export async function createTempWorktree(
  repoPath: string,
  ref: string,
): Promise<TempWorktree> {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex-wt-" });

  try {
    const cmd = new Deno.Command("git", {
      args: ["worktree", "add", "--detach", tempDir, ref],
      cwd: repoPath,
      stdout: "piped",
      stderr: "piped",
    });

    const output = await cmd.output();
    if (output.code !== 0) {
      const errText = new TextDecoder().decode(output.stderr);
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
    cleanup: async () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      activeTempWorktrees.delete(tempWorktree);

      try {
        const cmd = new Deno.Command("git", {
          args: ["worktree", "remove", "--force", tempDir],
          cwd: repoPath,
          stdout: "piped",
          stderr: "piped",
        });
        await cmd.output();
      } catch {
        // ignore
      }

      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // ignore
      }

      try {
        const pruneCmd = new Deno.Command("git", {
          args: ["worktree", "prune"],
          cwd: repoPath,
          stdout: "piped",
          stderr: "piped",
        });
        await pruneCmd.output();
      } catch {
        // ignore
      }
    },
  };

  activeTempWorktrees.add(tempWorktree);
  return tempWorktree;
}

/**
 * パスを指定して特定の一時 Worktree を安全に破棄する。
 */
export async function cleanupTempWorktreeByPath(path: string): Promise<void> {
  const norm = path.replace(/[/\\]+$/, "");
  for (const wt of activeTempWorktrees) {
    if (wt.path.replace(/[/\\]+$/, "") === norm) {
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
        new Deno.Command("git", {
          args: ["worktree", "remove", "--force", wt.path],
          cwd: wt.repoPath,
        }).outputSync();
      } catch {
        // ignore
      }
      try {
        Deno.removeSync(wt.path, { recursive: true });
      } catch {
        // ignore
      }
    }
  });
}
