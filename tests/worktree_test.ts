import { assertEquals } from "@std/assert";
import { join, normalize } from "@std/path";
import { createTempWorktree } from "../src/core/git/temp_worktree.ts";
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
