/**
 * ヘッドレス・非対話モードおよびエージェント互換セーフガード（B-9）のテスト。
 */

import { assertEquals } from "@std/assert";
import { runMain } from "../main.ts";
import { join } from "@std/path";

Deno.test("runMain: --headless または --stdout フラグで GUI を起動せず 0 で終了する", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_test_headless_" });
  try {
    const leftFile = join(tempDir, "left.txt");
    const rightFile = join(tempDir, "right.txt");
    await Deno.writeTextFile(leftFile, "left line 1\nleft line 2\n");
    await Deno.writeTextFile(rightFile, "right line 1\nright line 2\n");

    const codeHeadless = await runMain([leftFile, rightFile, "--headless"]);
    assertEquals(codeHeadless, 0);

    const codeStdout = await runMain([leftFile, rightFile, "--stdout"]);
    assertEquals(codeStdout, 0);

    const codeShortStdout = await runMain([leftFile, rightFile, "-s"]);
    assertEquals(codeShortStdout, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("runMain: git diff.external 7引数形式で起動された際に正常終了する", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_test_git_ext_" });
  try {
    const oldFile = join(tempDir, "old.txt");
    const newFile = join(tempDir, "new.txt");
    await Deno.writeTextFile(oldFile, "hello\n");
    await Deno.writeTextFile(newFile, "hello world\n");

    // git diff.external 呼び出し形式:
    // <path> <old-file> <old-hex> <old-mode> <new-file> <new-hex> <new-mode>
    const args = [
      "src/foo.ts",
      oldFile,
      "1234567",
      "100644",
      newFile,
      "7654321",
      "100644",
    ];

    const code = await runMain(args);
    assertEquals(code, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("runMain: ディレクトリ比較で --stdout を指定して正常終了する", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "diffrex_test_dir_headless_",
  });
  try {
    const leftDir = join(tempDir, "left");
    const rightDir = join(tempDir, "right");
    await Deno.mkdir(leftDir);
    await Deno.mkdir(rightDir);

    await Deno.writeTextFile(join(leftDir, "a.txt"), "hello\n");
    await Deno.writeTextFile(join(rightDir, "a.txt"), "hello world\n");

    const code = await runMain([leftDir, rightDir, "--stdout"]);
    assertEquals(code, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("runMain: 3-Way 比較で --stdout を指定して正常終了する", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "diffrex_test_3way_headless_",
  });
  try {
    const localFile = join(tempDir, "local.txt");
    const baseFile = join(tempDir, "base.txt");
    const remoteFile = join(tempDir, "remote.txt");

    await Deno.writeTextFile(localFile, "local change\n");
    await Deno.writeTextFile(baseFile, "base content\n");
    await Deno.writeTextFile(remoteFile, "remote change\n");

    const code = await runMain([localFile, baseFile, remoteFile, "--stdout"]);
    assertEquals(code, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
