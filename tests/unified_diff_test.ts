/**
 * Unified Diff 生成モジュール（B-9）のテスト。
 */

import { assertEquals } from "@std/assert";
import {
  formatDirectoryUnifiedDiff,
  formatUnifiedDiff,
} from "../src/core/unified_diff.ts";
import { join } from "@std/path";

Deno.test("formatUnifiedDiff: 差分がない場合は空文字列を返す", () => {
  const content = "line1\nline2\nline3\n";
  const diff = formatUnifiedDiff(content, content);
  assertEquals(diff, "");
});

Deno.test("formatUnifiedDiff: 単純な変更の Unified Diff を生成する", () => {
  const left = "line1\nline2\nline3\n";
  const right = "line1\nline2_modified\nline3\n";
  const diff = formatUnifiedDiff(left, right, {
    leftLabel: "a/test.txt",
    rightLabel: "b/test.txt",
  });

  const expected = [
    "--- a/test.txt",
    "+++ b/test.txt",
    "@@ -1,3 +1,3 @@",
    " line1",
    "-line2",
    "+line2_modified",
    " line3",
    "",
  ].join("\n");

  assertEquals(diff, expected);
});

Deno.test("formatUnifiedDiff: 行追加の Unified Diff を生成する", () => {
  const left = "line1\nline3\n";
  const right = "line1\nline2\nline3\n";
  const diff = formatUnifiedDiff(left, right, {
    leftLabel: "a/test.txt",
    rightLabel: "b/test.txt",
  });

  const expected = [
    "--- a/test.txt",
    "+++ b/test.txt",
    "@@ -1,2 +1,3 @@",
    " line1",
    "+line2",
    " line3",
    "",
  ].join("\n");

  assertEquals(diff, expected);
});

Deno.test("formatUnifiedDiff: 行削除の Unified Diff を生成する", () => {
  const left = "line1\nline2\nline3\n";
  const right = "line1\nline3\n";
  const diff = formatUnifiedDiff(left, right, {
    leftLabel: "a/test.txt",
    rightLabel: "b/test.txt",
  });

  const expected = [
    "--- a/test.txt",
    "+++ b/test.txt",
    "@@ -1,3 +1,2 @@",
    " line1",
    "-line2",
    " line3",
    "",
  ].join("\n");

  assertEquals(diff, expected);
});

Deno.test("formatUnifiedDiff: contextLines の設定が反映される", () => {
  const left = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10";
  const right = "1\n2\n3\n4\n5_mod\n6\n7\n8\n9\n10";
  const diff = formatUnifiedDiff(left, right, {
    leftLabel: "a/num.txt",
    rightLabel: "b/num.txt",
    contextLines: 1,
  });

  const expected = [
    "--- a/num.txt",
    "+++ b/num.txt",
    "@@ -4,3 +4,3 @@",
    " 4",
    "-5",
    "+5_mod",
    " 6",
    "",
  ].join("\n");

  assertEquals(diff, expected);
});

Deno.test("formatUnifiedDiff: 離れた複数 Hunk が別々に分割される", () => {
  const left = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15";
  const right = "1\n2_mod\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14_mod\n15";
  const diff = formatUnifiedDiff(left, right, {
    leftLabel: "a/multi.txt",
    rightLabel: "b/multi.txt",
    contextLines: 1,
  });

  const expected = [
    "--- a/multi.txt",
    "+++ b/multi.txt",
    "@@ -1,3 +1,3 @@",
    " 1",
    "-2",
    "+2_mod",
    " 3",
    "@@ -13,3 +13,3 @@",
    " 13",
    "-14",
    "+14_mod",
    " 15",
    "\\ No newline at end of file",
    "",
  ].join("\n");

  assertEquals(diff, expected);
});

Deno.test("formatDirectoryUnifiedDiff: ディレクトリ間の差分を再帰的に生成する", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_test_dir_" });
  try {
    const leftDir = join(tempDir, "left");
    const rightDir = join(tempDir, "right");
    await Deno.mkdir(leftDir);
    await Deno.mkdir(rightDir);

    await Deno.writeTextFile(join(leftDir, "file1.txt"), "hello\nworld\n");
    await Deno.writeTextFile(
      join(rightDir, "file1.txt"),
      "hello\nworld modified\n",
    );

    await Deno.writeTextFile(join(leftDir, "same.txt"), "same content\n");
    await Deno.writeTextFile(join(rightDir, "same.txt"), "same content\n");

    const diff = await formatDirectoryUnifiedDiff(leftDir, rightDir);
    assertEquals(diff.includes("--- a/file1.txt"), true);
    assertEquals(diff.includes("+++ b/file1.txt"), true);
    assertEquals(diff.includes("-world"), true);
    assertEquals(diff.includes("+world modified"), true);
    assertEquals(diff.includes("same.txt"), false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
