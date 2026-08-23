/**
 * ディレクトリ比較機能の単体・結合テスト（B1-11）。
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { parseCliArgs } from "../src/cli/args.ts";
import { validateCliArgs } from "../src/cli/validate.ts";
import {
  buildDirectoryTree,
  compareDirectories,
  compareFilePair,
} from "../src/core/dir_diff.ts";
import {
  isPathIgnored,
  loadIgnoreRules,
  parseIgnoreLines,
} from "../src/core/ignore.ts";
import type { FileDiffStatus } from "../src/core/types.ts";

Deno.test("ignore rules - parse and match default rules", () => {
  const rules = parseIgnoreLines(`
# comment
node_modules
dist/
*.log
!important.log
`);

  assertEquals(isPathIgnored("node_modules/foo.js", false, rules), true);
  assertEquals(isPathIgnored("dist/bundle.js", false, rules), true);
  assertEquals(isPathIgnored("app.log", false, rules), true);
  assertEquals(isPathIgnored("important.log", false, rules), false);
  assertEquals(isPathIgnored("src/app.ts", false, rules), false);
});

Deno.test("ignore rules - load default patterns", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const rules = await loadIgnoreRules(tempDir);
    assertEquals(isPathIgnored(".git/config", false, rules), true);
    assertEquals(
      isPathIgnored("node_modules/pkg/index.js", false, rules),
      true,
    );
    assertEquals(isPathIgnored("src/index.ts", false, rules), false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("dir_diff - compareFilePair staged detection", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const fileA = join(tempDir, "a.txt");
    const fileB = join(tempDir, "b.txt");
    const fileC = join(tempDir, "c.txt");
    const binFile = join(tempDir, "bin.dat");

    await Deno.writeTextFile(fileA, "hello world\n");
    await Deno.writeTextFile(fileB, "hello world\n");
    await Deno.writeTextFile(fileC, "hello modified\n");
    await Deno.writeFile(binFile, new Uint8Array([0x00, 0x01, 0x02]));

    const statA = await Deno.stat(fileA);
    const statB = await Deno.stat(fileB);
    const statC = await Deno.stat(fileC);

    const resIdentical = await compareFilePair(
      fileA,
      fileB,
      { relativePath: "a.txt", isDir: false, size: statA.size, mtime: 0 },
      { relativePath: "b.txt", isDir: false, size: statB.size, mtime: 0 },
    );
    assertEquals(resIdentical.status, "identical");

    const resModified = await compareFilePair(
      fileA,
      fileC,
      { relativePath: "a.txt", isDir: false, size: statA.size, mtime: 0 },
      { relativePath: "c.txt", isDir: false, size: statC.size, mtime: 0 },
    );
    assertEquals(resModified.status, "modified");

    const resBin = await compareFilePair(
      binFile,
      fileA,
      { relativePath: "bin.dat", isDir: false, size: 3, mtime: 0 },
      { relativePath: "a.txt", isDir: false, size: statA.size, mtime: 0 },
    );
    assertEquals(resBin.status, "binary");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("dir_diff - buildDirectoryTree hierarchy and status aggregation", () => {
  const entries = new Map<string, {
    isDir: boolean;
    status: FileDiffStatus;
    sizeLeft?: number;
    sizeRight?: number;
  }>([
    ["src/app.ts", { isDir: false, status: "modified" }],
    ["src/utils.ts", { isDir: false, status: "identical" }],
    ["README.md", { isDir: false, status: "identical" }],
    ["new_file.ts", { isDir: false, status: "added" }],
  ]);

  const tree = buildDirectoryTree(entries);
  assertEquals(tree.children?.length, 3); // src (dir), new_file.ts, README.md

  const srcDir = tree.children?.find((c) => c.name === "src");
  assertEquals(srcDir?.isDir, true);
  assertEquals(srcDir?.status, "modified"); // app.ts が modified なので src も modified
  assertEquals(srcDir?.children?.length, 2);
});

Deno.test("dir_diff - compareDirectories end to end", async () => {
  const baseDir = await Deno.makeTempDir();
  const targetDir = await Deno.makeTempDir();

  try {
    // Base: file1 (same), file2 (modified), file3 (deleted)
    await Deno.writeTextFile(join(baseDir, "file1.txt"), "same content\n");
    await Deno.writeTextFile(join(baseDir, "file2.txt"), "old content\n");
    await Deno.writeTextFile(join(baseDir, "file3.txt"), "to be deleted\n");

    // Target: file1 (same), file2 (modified), file4 (added)
    await Deno.writeTextFile(join(targetDir, "file1.txt"), "same content\n");
    await Deno.writeTextFile(join(targetDir, "file2.txt"), "new content\n");
    await Deno.writeTextFile(join(targetDir, "file4.txt"), "newly added\n");

    const session = await compareDirectories(baseDir, targetDir);

    assertEquals(session.mode, "directory");
    assertEquals(session.summary.identical, 1);
    assertEquals(session.summary.modified, 1);
    assertEquals(session.summary.deleted, 1);
    assertEquals(session.summary.added, 1);
    assertEquals(session.summary.total, 4);
  } finally {
    await Deno.remove(baseDir, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("cli - parse and validate directory and welcome arguments", async () => {
  // 1. 引数なし → welcome
  const resEmpty = parseCliArgs([]);
  assertEquals(resEmpty.ok, true);
  if (resEmpty.ok) {
    assertEquals(resEmpty.parsed.mode, "welcome");
    const validEmpty = await validateCliArgs(resEmpty.parsed);
    assertEquals(validEmpty.ok, true);
  }

  // 2. ディレクトリ同士 → directory
  const baseDir = await Deno.makeTempDir();
  const targetDir = await Deno.makeTempDir();
  try {
    const resDir = parseCliArgs([baseDir, targetDir]);
    assertEquals(resDir.ok, true);
    if (resDir.ok) {
      const validDir = await validateCliArgs(resDir.parsed);
      assertEquals(validDir.ok, true);
      assertEquals(resDir.parsed.mode, "directory");
    }
  } finally {
    await Deno.remove(baseDir, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});
