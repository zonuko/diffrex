/**
 * ノイズ差分（空白・インデント・コメントのみ）判定テスト (P4-06)。
 */

import { assertEquals } from "@std/assert";
import {
  analyzeNoise,
  isWhitespaceOnlyChange,
  stripCommentsAndWhitespace,
} from "../src/core/analysis/noise.ts";
import { analyzeDiff } from "../src/core/analysis/index.ts";
import { diffLinesToHunks } from "../src/core/diff.ts";

Deno.test("isWhitespaceOnlyChange: インデントおよび余分な空白の違いを検出できる", () => {
  const left = ["  const x = 1;", "  const y = 2;"];
  const right = ["    const x = 1;", "    const y = 2;"];
  assertEquals(isWhitespaceOnlyChange(left, right), true);

  const leftDiff = ["const x = 1;"];
  const rightDiff = ["const x = 2;"];
  assertEquals(isWhitespaceOnlyChange(leftDiff, rightDiff), false);
});

Deno.test("stripCommentsAndWhitespace: コメントと空白を除去し、文字列リテラルを保護する", () => {
  const lines = [
    'const url = "https://example.com//test"; // URL',
    'const color = "#ff0000"; /* 赤色 */',
    "// 全体コメント",
    "# pythonコメント",
  ];
  const stripped = stripCommentsAndWhitespace(lines);
  assertEquals(
    stripped,
    'const url = "https://example.com//test"; const color = "#ff0000";',
  );
});

Deno.test("analyzeNoise: 空白のみの変更を noise と判定する", () => {
  const base = "function hello() {\n  return 'world';\n}";
  const target = "function hello() {\n    return 'world';\n}";
  const hunks = diffLinesToHunks(base, target);
  assertEquals(hunks.length, 1);

  const res = analyzeNoise(hunks[0]);
  assertEquals(res.isNoise, true);
  assertEquals(res.noiseReason, "whitespace");
});

Deno.test("analyzeNoise: コメントのみの追加・変更を noise と判定する", () => {
  const base = "// 古いコメント\nconst a = 10;";
  const target = "// 新しい詳細コメント\nconst a = 10;";
  const hunks = diffLinesToHunks(base, target);
  assertEquals(hunks.length, 1);

  const res = analyzeNoise(hunks[0]);
  assertEquals(res.isNoise, true);
  assertEquals(res.noiseReason, "comment");
});

Deno.test("analyzeNoise: 文字列リテラル内の // や # を含むコード変更は noise と判定しない", () => {
  const base = 'const api = "https://v1.api.com";';
  const target = 'const api = "https://v2.api.com";';
  const hunks = diffLinesToHunks(base, target);
  assertEquals(hunks.length, 1);

  const res = analyzeNoise(hunks[0]);
  assertEquals(res.isNoise, false);
});

Deno.test("analyzeDiff: sample_base.ts と sample_target.ts のインデント・コメント差分が noise になる", async () => {
  const base = await Deno.readTextFile("tests/fixtures/sample_base.ts");
  const target = await Deno.readTextFile("tests/fixtures/sample_target.ts");

  const hunks = analyzeDiff(base, target);
  // (2) formatLabel のインデント変更
  const indentHunk = hunks.find((h) =>
    h.lineStartLeft >= 18 && h.lineEndLeft <= 22
  );
  assertEquals(indentHunk !== undefined, true);
  assertEquals(indentHunk?.isNoise, true);

  // (3) parseConfig のコメント変更
  const commentHunk = hunks.find((h) =>
    h.lineStartLeft >= 23 && h.lineEndLeft <= 33
  );
  assertEquals(commentHunk !== undefined, true);
  assertEquals(commentHunk?.isNoise, true);
});
