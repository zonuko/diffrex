/**
 * リスク評価およびサマリータグ判定テスト (P4-06)。
 */

import { assertEquals } from "@std/assert";
import { analyzeDiff } from "../src/core/analysis/index.ts";

Deno.test("analyzeDiff: 10行超の削除が danger と判定される", () => {
  const base = [
    "function largeBlock() {",
    "  line 1",
    "  line 2",
    "  line 3",
    "  line 4",
    "  line 5",
    "  line 6",
    "  line 7",
    "  line 8",
    "  line 9",
    "  line 10",
    "  line 11",
    "}",
  ].join("\n");
  const target = "function largeBlock() {}";

  const hunks = analyzeDiff(base, target);
  assertEquals(hunks.length, 1);
  assertEquals(hunks[0].riskLevel, "danger");
  assertEquals(hunks[0].summaryTag?.includes("lines deleted"), true);
});

Deno.test("analyzeDiff: 関数・型・インターフェースのシグネチャ変更が danger と判定される", () => {
  const base = "export function processUser(id: string): void {}";
  const target =
    "export function processUser(id: string, role: string): boolean { return true; }";

  const hunks = analyzeDiff(base, target);
  assertEquals(hunks.length, 1);
  assertEquals(hunks[0].riskLevel, "danger");
  assertEquals(hunks[0].summaryTag?.includes("Signature"), true);
});

Deno.test("analyzeDiff: エラーハンドリングの削除が warning と判定される", () => {
  const base = [
    "function loadData() {",
    "  try {",
    "    fetchData();",
    "  } catch (err) {",
    "    console.error(err);",
    "  }",
    "}",
  ].join("\n");
  const target = [
    "function loadData() {",
    "  fetchData();",
    "}",
  ].join("\n");

  const hunks = analyzeDiff(base, target);
  assertEquals(hunks.length, 1);
  assertEquals(hunks[0].riskLevel, "warning");
  assertEquals(hunks[0].summaryTag, "[Risk] Error handling removed");
});

Deno.test("analyzeDiff: ハードコードされたシークレットの追加が warning と判定される", () => {
  const base = "const apiKey = process.env.API_KEY;";
  const target = 'const apiKey = "sk-1234567890abcdef1234567890";';

  const hunks = analyzeDiff(base, target);
  assertEquals(hunks.length, 1);
  assertEquals(hunks[0].riskLevel, "warning");
  assertEquals(hunks[0].summaryTag, "[Risk] Potential secret added");
});

Deno.test("analyzeDiff: 通常の小規模コード変更が normal と判定される", () => {
  const base = "const total = price * 1.08;";
  const target = "const total = price * 1.10;";

  const hunks = analyzeDiff(base, target);
  assertEquals(hunks.length, 1);
  assertEquals(hunks[0].riskLevel, "normal");
});

Deno.test("analyzeDiff: sample_base.ts と sample_target.ts の全5ケースが期待通り判定される", async () => {
  const base = await Deno.readTextFile("tests/fixtures/sample_base.ts");
  const target = await Deno.readTextFile("tests/fixtures/sample_target.ts");

  const hunks = analyzeDiff(base, target);
  assertEquals(hunks.length >= 4, true);

  // 全ての hunk が unreviewed で初期化されていること
  for (const h of hunks) {
    assertEquals(h.status, "unreviewed");
  }

  // (1) calcTotal の税率変更 -> risk normal
  const logicHunk = hunks.find((h) =>
    h.lineStartLeft >= 10 && h.lineEndLeft <= 16
  );
  assertEquals(logicHunk?.riskLevel, "normal");
  assertEquals(logicHunk?.isNoise, false);

  // (2) formatLabel のインデント変更 -> noise
  const indentHunk = hunks.find((h) =>
    h.lineStartLeft >= 18 && h.lineEndLeft <= 21
  );
  assertEquals(indentHunk?.isNoise, true);

  // (3) parseConfig のコメント変更 -> noise
  const commentHunk = hunks.find((h) =>
    h.lineStartLeft >= 23 && h.lineEndLeft <= 33
  );
  assertEquals(commentHunk?.isNoise, true);

  // (4) legacyReport 12行削除 -> risk danger (12 lines deleted)
  const deleteHunk = hunks.find((h) =>
    h.lineStartLeft >= 36 && h.lineEndLeft <= 48
  );
  assertEquals(deleteHunk?.riskLevel, "danger");

  // (5) applyDiscount シグネチャ変更 -> risk danger
  const sigHunk = hunks.find((h) =>
    h.lineStartLeft >= 50 && h.lineEndLeft <= 53
  );
  assertEquals(sigHunk?.riskLevel, "danger");
});
