import { assertEquals } from "@std/assert";
import { join, normalize } from "@std/path";
import {
  cleanupTempWorktreeByPath,
  createTempWorktree,
  getOrCreateTempWorktree,
} from "../src/core/git/temp_worktree.ts";
import {
  getCurrentBranch,
  isGitRepository,
  listGitWorktrees,
  parseWorktreeListPorcelain,
  resolveGitDir,
} from "../src/core/git/worktree.ts";

Deno.test("isGitRepository: .git ディレクトリが存在する場合に true を返す", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex-wt-test-" });
  try {
    assertEquals(await isGitRepository(tempDir), false);
    await Deno.mkdir(join(tempDir, ".git"));
    assertEquals(await isGitRepository(tempDir), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("isGitRepository: .git ファイル (gitdir) が存在する場合に true を返す", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex-wt-test-" });
  try {
    const gitFilePath = join(tempDir, ".git");
    await Deno.writeTextFile(
      gitFilePath,
      "gitdir: /path/to/main/.git/worktrees/wt1\n",
    );
    assertEquals(await isGitRepository(tempDir), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("resolveGitDir: .git ディレクトリおよびファイルのパスを正しく解決する", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex-wt-test-" });
  try {
    // ディレクトリ
    const gitSubDir = join(tempDir, ".git");
    await Deno.mkdir(gitSubDir);
    assertEquals(await resolveGitDir(tempDir), normalize(gitSubDir));

    // ファイル (相対パス)
    await Deno.remove(gitSubDir);
    const gitFile = join(tempDir, ".git");
    await Deno.writeTextFile(
      gitFile,
      "gitdir: ../main_repo/.git/worktrees/wt\n",
    );
    const resolved = await resolveGitDir(tempDir);
    assertEquals(
      resolved,
      normalize(join(tempDir, "../main_repo/.git/worktrees/wt")),
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("parseWorktreeListPorcelain: porcelain 出力を正しくオブジェクト配列に変換する", () => {
  const raw = `
worktree /home/user/project
HEAD 0123456789abcdef0123456789abcdef01234567
branch refs/heads/main

worktree /home/user/project-wt1
HEAD abcdef0123456789abcdef0123456789abcdef01
branch refs/heads/feature-1

worktree /home/user/project-bare
bare
`;

  const parsed = parseWorktreeListPorcelain(raw, "/home/user/project");
  assertEquals(parsed.length, 3);

  assertEquals(parsed[0].path, normalize("/home/user/project"));
  assertEquals(parsed[0].head, "0123456789abcdef0123456789abcdef01234567");
  assertEquals(parsed[0].branch, "main");
  assertEquals(parsed[0].isCurrent, true);

  assertEquals(parsed[1].path, normalize("/home/user/project-wt1"));
  assertEquals(parsed[1].branch, "feature-1");
  assertEquals(parsed[1].isCurrent, false);

  assertEquals(parsed[2].path, normalize("/home/user/project-bare"));
  assertEquals(parsed[2].bare, true);
});

Deno.test("createTempWorktree & cleanup: 一時 Worktree を作成し安全に破棄できる", async () => {
  const tempRepo = await Deno.makeTempDir({ prefix: "diffrex-git-repo-" });

  try {
    // git init
    const initCmd = new Deno.Command("git", {
      args: ["init"],
      cwd: tempRepo,
    });
    await initCmd.output();

    // git config user
    await new Deno.Command("git", {
      args: ["config", "user.name", "Diffrex Tester"],
      cwd: tempRepo,
    }).output();
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@diffrex.dev"],
      cwd: tempRepo,
    }).output();

    // initial commit
    await Deno.writeTextFile(join(tempRepo, "hello.txt"), "hello world\n");
    await new Deno.Command("git", {
      args: ["add", "hello.txt"],
      cwd: tempRepo,
    }).output();
    await new Deno.Command("git", {
      args: ["commit", "-m", "initial commit"],
      cwd: tempRepo,
    }).output();

    // branch 作成
    await new Deno.Command("git", {
      args: ["branch", "test-branch"],
      cwd: tempRepo,
    }).output();

    const branch = await getCurrentBranch(tempRepo);
    assertEquals(typeof branch, "string");

    const worktrees = await listGitWorktrees(tempRepo);
    assertEquals(worktrees.length >= 1, true);
    assertEquals(worktrees[0].isCurrent, true);

    // 一時 Worktree 作成
    const tempWt = await createTempWorktree(tempRepo, "test-branch");
    assertEquals(await isGitRepository(tempWt.path), true);

    // 一時 Worktree 内に hello.txt が存在することを確認
    const content = await Deno.readTextFile(join(tempWt.path, "hello.txt"));
    assertEquals(content.replace(/\r\n/g, "\n"), "hello world\n");

    // cleanup
    await tempWt.cleanup();

    // cleanup 後はディレクトリが存在しないか削除済みであること
    let exists = true;
    try {
      await Deno.stat(tempWt.path);
    } catch {
      exists = false;
    }
    assertEquals(exists, false);
  } finally {
    try {
      await Deno.remove(tempRepo, { recursive: true });
    } catch {
      // ignore
    }
  }
});

Deno.test("getOrCreateTempWorktree: 同一ブランチ・同一 HEAD では既存 Worktree を再利用し多重生成を防ぐ (FIX-02)", async () => {
  const tempRepo = await Deno.makeTempDir({ prefix: "diffrex-wt-reuse-" });

  try {
    // git init & commit
    await new Deno.Command("git", { args: ["init"], cwd: tempRepo }).output();
    await new Deno.Command("git", {
      args: ["config", "user.name", "Diffrex Tester"],
      cwd: tempRepo,
    }).output();
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@diffrex.dev"],
      cwd: tempRepo,
    }).output();
    await Deno.writeTextFile(join(tempRepo, "file.txt"), "v1\n");
    await new Deno.Command("git", { args: ["add", "file.txt"], cwd: tempRepo })
      .output();
    await new Deno.Command("git", {
      args: ["commit", "-m", "first commit"],
      cwd: tempRepo,
    }).output();

    // 1回目の取得
    const wt1 = await getOrCreateTempWorktree(tempRepo, "HEAD");
    const path1 = wt1.path;

    // 2回目の取得（同一ブランチ・同一HEAD、既存パス指定あり）
    const wt2 = await getOrCreateTempWorktree(tempRepo, "HEAD", path1);
    assertEquals(wt2.path, path1);

    // 3回目の取得（同一ブランチ・同一HEAD、既存パス指定なしでも再利用）
    const wt3 = await getOrCreateTempWorktree(tempRepo, "HEAD");
    assertEquals(wt3.path, path1);

    // ディレクトリが正常に存在すること
    const stat = await Deno.stat(path1);
    assertEquals(stat.isDirectory, true);

    // クリーンアップ
    await cleanupTempWorktreeByPath(path1);

    let exists = true;
    try {
      await Deno.stat(path1);
    } catch {
      exists = false;
    }
    assertEquals(exists, false);
  } finally {
    try {
      await Deno.remove(tempRepo, { recursive: true });
    } catch {
      // ignore
    }
  }
});

Deno.test("buildGitDirectoryDiffSession: existingTempWorktreePath を渡したリロード時に Worktree が増殖しないこと (FIX-02)", async () => {
  const tempRepo = await Deno.makeTempDir({ prefix: "diffrex-status-reuse-" });

  try {
    await new Deno.Command("git", { args: ["init"], cwd: tempRepo }).output();
    await new Deno.Command("git", {
      args: ["config", "user.name", "Diffrex Tester"],
      cwd: tempRepo,
    }).output();
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@diffrex.dev"],
      cwd: tempRepo,
    }).output();
    await Deno.writeTextFile(join(tempRepo, "a.txt"), "hello\n");
    await new Deno.Command("git", { args: ["add", "a.txt"], cwd: tempRepo })
      .output();
    await new Deno.Command("git", {
      args: ["commit", "-m", "init"],
      cwd: tempRepo,
    }).output();

    const { buildGitDirectoryDiffSession } = await import(
      "../src/core/git/status.ts"
    );

    // 初回セッション生成
    const session1 = await buildGitDirectoryDiffSession(tempRepo);
    const wtPath1 = session1.git?.tempWorktreePath;
    assertEquals(typeof wtPath1, "string");

    // リロード実行（existingTempWorktreePath を渡す）
    const session2 = await buildGitDirectoryDiffSession(tempRepo, {
      existingTempWorktreePath: wtPath1,
    });
    const wtPath2 = session2.git?.tempWorktreePath;

    // 同一の一時 Worktree パスが維持・再利用されていること
    assertEquals(wtPath2, wtPath1);

    if (wtPath1) {
      await cleanupTempWorktreeByPath(wtPath1);
    }
  } finally {
    try {
      await Deno.remove(tempRepo, { recursive: true });
    } catch {
      // ignore
    }
  }
});

Deno.test("parseGitDiffNoIndexOutput: 出力から相対パスとステータスを正しくパースし .git を除外する (FIX-06)", async () => {
  const { parseGitDiffNoIndexOutput } = await import(
    "../src/core/git/status.ts"
  );
  const baseDir = "C:/test/repo-wt";
  const targetDir = "C:/test/repo-main";
  const sampleOutput = [
    "M\tC:/test/repo-wt/src/app.ts",
    "A\tC:/test/repo-main/src/new.ts",
    "D\tC:/test/repo-wt/old.ts",
    "R100\tC:/test/repo-wt/renamed_old.ts\tC:/test/repo-main/renamed_new.ts",
    "M\tC:/test/repo-wt/.git/config",
    "warning: CRLF will be replaced by LF",
  ].join("\n");

  const entries = parseGitDiffNoIndexOutput(sampleOutput, baseDir, targetDir);
  assertEquals(entries.length, 4);

  assertEquals(entries[0], {
    relativePath: "src/app.ts",
    status: "modified",
    gitStatus: "M",
  });
  assertEquals(entries[1], {
    relativePath: "src/new.ts",
    status: "added",
    gitStatus: "A",
  });
  assertEquals(entries[2], {
    relativePath: "old.ts",
    status: "deleted",
    gitStatus: "D",
  });
  assertEquals(entries[3], {
    relativePath: "renamed_new.ts",
    origPath: "renamed_old.ts",
    status: "modified",
    gitStatus: "R",
  });
});

Deno.test("buildGitWorktreeDiffSession: 実体 Worktree 比較で変更ファイルのみ特定し worktrees 一覧とブランチ名を保持する (FIX-06, FIX-07)", async () => {
  const tempRepo = await Deno.makeTempDir({ prefix: "diffrex-wt-diff-main-" });
  const tempWt = await Deno.makeTempDir({ prefix: "diffrex-wt-diff-wt-" });

  try {
    await new Deno.Command("git", { args: ["init"], cwd: tempRepo }).output();
    await new Deno.Command("git", {
      args: ["config", "user.name", "Diffrex Tester"],
      cwd: tempRepo,
    }).output();
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@diffrex.dev"],
      cwd: tempRepo,
    }).output();

    await Deno.writeTextFile(join(tempRepo, "unchanged.txt"), "same\n");
    await Deno.writeTextFile(join(tempRepo, "modified.txt"), "left content\n");
    await Deno.writeTextFile(
      join(tempRepo, "deleted_in_right.txt"),
      "deleted later\n",
    );

    await new Deno.Command("git", { args: ["add", "."], cwd: tempRepo })
      .output();
    await new Deno.Command("git", {
      args: ["commit", "-m", "init"],
      cwd: tempRepo,
    }).output();

    // worktree を追加
    await new Deno.Command("git", {
      args: ["worktree", "add", "-b", "feature-wt", tempWt],
      cwd: tempRepo,
    }).output();

    // メイン側（Target）でファイルを変更・追加・削除
    await Deno.writeTextFile(
      join(tempRepo, "modified.txt"),
      "right modified content\n",
    );
    await Deno.writeTextFile(
      join(tempRepo, "added_in_right.txt"),
      "new file\n",
    );
    await Deno.remove(join(tempRepo, "deleted_in_right.txt"));

    const { buildGitWorktreeDiffSession } = await import(
      "../src/core/git/status.ts"
    );

    const session = await buildGitWorktreeDiffSession(tempRepo, tempWt);

    assertEquals(session.isGitRepo, true);
    assertEquals(session.git?.isGitRepo, true);
    assertEquals(session.git?.isWorktreeComparison, true);
    assertEquals(session.git?.branch, "feature-wt");
    assertEquals(
      session.git?.worktrees && session.git.worktrees.length >= 2,
      true,
    );

    // unchanged.txt は含まれず、変更された3ファイルのみ検出されること
    assertEquals(session.summary.total, 3);
    assertEquals(session.summary.modified, 1);
    assertEquals(session.summary.added, 1);
    assertEquals(session.summary.deleted, 1);

    // Base ディレクトリが tempWt であり、実体ファイルが正しく存在すること（FIX-07）
    assertEquals(session.baseDir, normalize(tempWt));
    assertEquals(session.targetDir, normalize(tempRepo));

    const leftContent = await Deno.readTextFile(
      join(session.baseDir, "modified.txt"),
    );
    const rightContent = await Deno.readTextFile(
      join(session.targetDir, "modified.txt"),
    );
    assertEquals(leftContent.trim(), "left content");
    assertEquals(rightContent.trim(), "right modified content");
  } finally {
    try {
      await new Deno.Command("git", {
        args: ["worktree", "remove", "--force", tempWt],
        cwd: tempRepo,
      }).output();
    } catch {
      // ignore
    }
    try {
      await Deno.remove(tempWt, { recursive: true });
    } catch {
      // ignore
    }
    try {
      await Deno.remove(tempRepo, { recursive: true });
    } catch {
      // ignore
    }
  }
});
