/**
 * AST セマンティック Diff（Tree-sitter WASM）のテスト (B2-01, B2-02, B2-03)。
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import {
  analyzeAstDiff,
  analyzeDiffAsync,
  detectBlockMoves,
  detectLanguageFromFilename,
  detectRenames,
  extractBlockNodes,
  parseCodeToAst,
} from "../src/core/analysis/index.ts";

Deno.test("detectLanguageFromFilename: 正しく拡張子から言語を判別できる", () => {
  assertEquals(detectLanguageFromFilename("foo.ts"), "typescript");
  assertEquals(detectLanguageFromFilename("foo.tsx"), "typescript");
  assertEquals(detectLanguageFromFilename("bar.js"), "javascript");
  assertEquals(detectLanguageFromFilename("bar.jsx"), "javascript");
  assertEquals(detectLanguageFromFilename("script.py"), "python");
  assertEquals(detectLanguageFromFilename("main.rs"), "rust");
  assertEquals(detectLanguageFromFilename("server.go"), "go");
  assertEquals(detectLanguageFromFilename("app.rb"), "ruby");
  assertEquals(detectLanguageFromFilename("Rakefile"), "ruby");
  assertEquals(detectLanguageFromFilename("doc.md"), null);
});

Deno.test("parseCodeToAst: Ruby コードをパースして AST を構築できる", async () => {
  const code = `
def greet(name)
  "Hello, #{name}!"
end
`;
  const result = await parseCodeToAst(code, "ruby");
  assertNotEquals(result, null);
  assertEquals(result!.language, "ruby");

  const blocks = extractBlockNodes(result!.tree.rootNode, "ruby");
  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].name, "greet");
  assertEquals(blocks[0].kind, "function");
});

Deno.test("parseCodeToAst: TypeScript コードをパースして AST を構築できる", async () => {
  const code = `
    export function add(a: number, b: number): number {
      return a + b;
    }
  `;
  const result = await parseCodeToAst(code, "typescript");
  assertNotEquals(result, null);
  assertEquals(result!.language, "typescript");
  assertEquals(result!.tree.rootNode.type, "program");

  const blocks = extractBlockNodes(result!.tree.rootNode, "typescript");
  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].name, "add");
  assertEquals(blocks[0].kind, "function");
});

Deno.test("parseCodeToAst: Python コードをパースして AST を構築できる", async () => {
  const code = `
def multiply(x, y):
    return x * y
`;
  const result = await parseCodeToAst(code, "python");
  assertNotEquals(result, null);
  assertEquals(result!.language, "python");

  const blocks = extractBlockNodes(result!.tree.rootNode, "python");
  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].name, "multiply");
  assertEquals(blocks[0].kind, "function");
});

Deno.test("detectBlockMoves: TypeScript の関数移動（Move）を正確に検出できる (B2-02)", async () => {
  const baseCode = await Deno.readTextFile(
    "tests/fixtures/semantic/move_base.ts",
  );
  const targetCode = await Deno.readTextFile(
    "tests/fixtures/semantic/move_target.ts",
  );

  const baseParsed = await parseCodeToAst(baseCode, "typescript");
  const targetParsed = await parseCodeToAst(targetCode, "typescript");

  const baseBlocks = extractBlockNodes(baseParsed!.tree.rootNode, "typescript");
  const targetBlocks = extractBlockNodes(
    targetParsed!.tree.rootNode,
    "typescript",
  );

  const moves = detectBlockMoves(baseBlocks, targetBlocks);

  assertEquals(moves.length >= 2, true);
  const moveNames = moves.map((m) => m.annotation.nodeName);
  assertEquals(moveNames.includes("calculateSubtotal"), true);
  assertEquals(moveNames.includes("formatCurrency"), true);

  const subtotalMove = moves.find((m) =>
    m.annotation.nodeName === "calculateSubtotal"
  )!;
  assertEquals(
    subtotalMove.annotation.fromLineStart < subtotalMove.annotation.toLineStart,
    true,
  );
});

Deno.test("detectBlockMoves: Python の関数移動（Move）を正確に検出できる (B2-02)", async () => {
  const baseCode = await Deno.readTextFile(
    "tests/fixtures/semantic/python_move_base.py",
  );
  const targetCode = await Deno.readTextFile(
    "tests/fixtures/semantic/python_move_target.py",
  );

  const baseParsed = await parseCodeToAst(baseCode, "python");
  const targetParsed = await parseCodeToAst(targetCode, "python");

  const baseBlocks = extractBlockNodes(baseParsed!.tree.rootNode, "python");
  const targetBlocks = extractBlockNodes(targetParsed!.tree.rootNode, "python");

  const moves = detectBlockMoves(baseBlocks, targetBlocks);
  assertEquals(moves.length >= 1, true);
  const moveNames = moves.map((m) => m.annotation.nodeName);
  assertEquals(
    moveNames.includes("main_process") || moveNames.includes("helper_alpha"),
    true,
  );
});

Deno.test("detectBlockMoves: Ruby のメソッド移動（Move）を正確に検出できる (B2-02)", async () => {
  const baseCode = await Deno.readTextFile(
    "tests/fixtures/semantic/ruby_move_base.rb",
  );
  const targetCode = await Deno.readTextFile(
    "tests/fixtures/semantic/ruby_move_target.rb",
  );

  const baseParsed = await parseCodeToAst(baseCode, "ruby");
  const targetParsed = await parseCodeToAst(targetCode, "ruby");

  const baseBlocks = extractBlockNodes(baseParsed!.tree.rootNode, "ruby");
  const targetBlocks = extractBlockNodes(targetParsed!.tree.rootNode, "ruby");

  const moves = detectBlockMoves(baseBlocks, targetBlocks);
  assertEquals(moves.length >= 1, true);
  const moveNames = moves.map((m) => m.annotation.nodeName);
  assertEquals(
    moveNames.includes("checkout") || moveNames.includes("calculate_discount"),
    true,
  );
});

Deno.test("detectRenames: 一括リネーム（Rename）を検出し置換マップを生成できる (B2-03)", async () => {
  const baseCode = await Deno.readTextFile(
    "tests/fixtures/semantic/rename_base.ts",
  );
  const targetCode = await Deno.readTextFile(
    "tests/fixtures/semantic/rename_target.ts",
  );

  const baseParsed = await parseCodeToAst(baseCode, "typescript");
  const targetParsed = await parseCodeToAst(targetCode, "typescript");

  const baseBlocks = extractBlockNodes(baseParsed!.tree.rootNode, "typescript");
  const targetBlocks = extractBlockNodes(
    targetParsed!.tree.rootNode,
    "typescript",
  );

  const renames = detectRenames(baseBlocks, targetBlocks);
  assertEquals(renames.length, 1);
  assertEquals(renames[0].renameMap["x"], "deltaX");
  assertEquals(renames[0].renameMap["y"], "deltaY");
  assertEquals(renames[0].summaryTag.includes("x -> deltaX"), true);
});

Deno.test("analyzeDiffAsync: Move や Rename が HunkAnnotation に反映される", async () => {
  const baseCode = await Deno.readTextFile(
    "tests/fixtures/semantic/rename_base.ts",
  );
  const targetCode = await Deno.readTextFile(
    "tests/fixtures/semantic/rename_target.ts",
  );

  const hunks = await analyzeDiffAsync(baseCode, targetCode, {
    filename: "rename_target.ts",
  });

  assertEquals(hunks.length > 0, true);
  const renameHunk = hunks.find((h) => h.noiseReason === "rename");
  assertNotEquals(renameHunk, undefined);
  assertEquals(renameHunk!.isNoise, true);
  assertEquals(renameHunk!.summaryTag?.includes("[Rename]"), true);
});

Deno.test("analyzeAstDiff: 非対応ファイル（Markdown 等）では graceful に null を返す", async () => {
  const res = await analyzeAstDiff(
    "# Title A\n\nHello",
    "# Title B\n\nHello",
    "doc.md",
  );
  assertEquals(res, null);
});
