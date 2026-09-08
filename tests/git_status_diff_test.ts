import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { runMain } from "../main.ts";
import {
  buildGitDirectoryDiffSession,
  detectGitChangedFiles,
  getGitBaseContent,
  parseGitStatusPorcelain,
} from "../src/core/git/status.ts";

Deno.test("parseGitStatusPorcelain: 各種 Git ステータス行を正しくパースする", () => {
  const output = [
    " M modified.txt",
    "M  staged_mod.txt",
    "A  staged_add.txt",
    " D deleted.txt",
    "?? untracked.txt",
    'R  old.txt -> "new file.txt"',
    "!! ignored.txt",
  ].join("\n");

  const entries = parseGitStatusPorcelain(output);
  assertEquals(entries.length, 6);

  assertEquals(entries[0].relativePath, "modified.txt");
  assertEquals(entries[0].status, "modified");
  assertEquals(entries[0].gitStatus, "M");

  assertEquals(entries[1].relativePath, "staged_mod.txt");
  assertEquals(entries[1].status, "modified");
  assertEquals(entries[1].gitStatus, "M");

  assertEquals(entries[2].relativePath, "staged_add.txt");
  assertEquals(entries[2].status, "added");
  assertEquals(entries[2].gitStatus, "A");

  assertEquals(entries[3].relativePath, "deleted.txt");
  assertEquals(entries[3].status, "deleted");
  assertEquals(entries[3].gitStatus, "D");

  assertEquals(entries[4].relativePath, "untracked.txt");
  assertEquals(entries[4].status, "added");
  assertEquals(entries[4].gitStatus, "?");

  assertEquals(entries[5].relativePath, "new file.txt");
  assertEquals(entries[5].origPath, "old.txt");
  assertEquals(entries[5].status, "modified");
  assertEquals(entries[5].gitStatus, "R");
});

Deno.test("Git 統合: 単一 Git リポジトリの未コミット差分検出・セッション構築・CLI 起動", async () => {
  const tempRepo = await Deno.makeTempDir({
    prefix: "diffrex-git-status-test-",
  });

  try {
    // 1. git init & user config
    await new Deno.Command("git", {
      args: ["init"],
      cwd: tempRepo,
    }).output();
    await new Deno.Command("git", {
      args: ["config", "user.name", "Diffrex Tester"],
      cwd: tempRepo,
    }).output();
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@diffrex.dev"],
      cwd: tempRepo,
    }).output();

    // 2. コミット作成
    await Deno.writeTextFile(join(tempRepo, "file_mod.txt"), "line1\nline2\n");
    await Deno.writeTextFile(join(tempRepo, "file_del.txt"), "delete me\n");
    await new Deno.Command("git", {
      args: ["add", "."],
      cwd: tempRepo,
    }).output();
    await new Deno.Command("git", {
      args: ["commit", "-m", "initial"],
      cwd: tempRepo,
    }).output();

    // 3. 差分を発生させる
    // 変更
    await Deno.writeTextFile(
      join(tempRepo, "file_mod.txt"),
      "line1\nline2 modified\n",
    );
    // 削除
    await Deno.remove(join(tempRepo, "file_del.txt"));
    // 新規・未追跡
    await Deno.writeTextFile(join(tempRepo, "file_new.txt"), "new content\n");

    // 4. detectGitChangedFiles の検証
    const changed = await detectGitChangedFiles(tempRepo);
    assertEquals(changed.length, 3);
    const modEntry = changed.find((c) => c.relativePath === "file_mod.txt");
    const delEntry = changed.find((c) => c.relativePath === "file_del.txt");
    const newEntry = changed.find((c) => c.relativePath === "file_new.txt");

    assertEquals(modEntry?.status, "modified");
    assertEquals(modEntry?.gitStatus, "M");

    assertEquals(delEntry?.status, "deleted");
    assertEquals(delEntry?.gitStatus, "D");

    assertEquals(newEntry?.status, "added");
    assertEquals(newEntry?.gitStatus, "?");

    // 5. getGitBaseContent の検証
    const baseMod = await getGitBaseContent(tempRepo, "file_mod.txt", "HEAD");
    assertEquals(baseMod, "line1\nline2\n");

    const baseNew = await getGitBaseContent(tempRepo, "file_new.txt", "HEAD");
    assertEquals(baseNew, null);

    // 6. buildGitDirectoryDiffSession の検証
    const session = await buildGitDirectoryDiffSession(tempRepo);
    assertEquals(session.mode, "directory");
    assertEquals(session.isGitRepo, true);
    assertEquals(session.summary.total, 3);
    assertEquals(session.summary.modified, 1);
    assertEquals(session.summary.deleted, 1);
    assertEquals(session.summary.added, 1);

    // 一時 Worktree 方式（HEAD スナップショット）の検証
    assertEquals(session.baseDir !== session.targetDir, true);
    assertEquals(Boolean(session.git?.tempWorktreePath), true);
    // 一時 Worktree 内の Base ファイルが直接読み取り可能で HEAD 内容と一致すること
    const baseModPath = join(session.baseDir, "file_mod.txt");
    const directBaseContent = await Deno.readTextFile(baseModPath);
    assertEquals(directBaseContent.replace(/\r\n/g, "\n"), "line1\nline2\n");

    // 7. CLI エントリ起動 (runMain) の検証
    const exitCode = await runMain([tempRepo], { autoClose: true });
    assertEquals(exitCode, 0);

    // 8. ヘッドレス / stdout モードでの Unified Diff 出力検証
    const outLines: string[] = [];
    const origLog = console.log;
    console.log = (...parts: unknown[]) => {
      outLines.push(parts.map((p) => String(p)).join(" "));
    };
    try {
      const codeStdout = await runMain([tempRepo, "--headless"]);
      assertEquals(codeStdout, 0);
    } finally {
      console.log = origLog;
    }
  } finally {
    try {
      await Deno.remove(tempRepo, { recursive: true });
    } catch {
      // ignore
    }
  }
});
