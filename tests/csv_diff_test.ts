/**
 * CSV / TSV パーサーおよびグリッド差分計算テスト（B-5）。
 */
import { assertEquals } from "@std/assert";
import { diffCsv, parseCsv } from "../src/core/structured/csv_parser.ts";

Deno.test("parseCsv - standard RFC 4180 CSV parsing", () => {
  const csv = `id,name,role
1,Alice,Engineer
2,"Bob, Jr.",Designer
3,"Charlie with
newline",Manager`;

  const rows = parseCsv(csv);
  assertEquals(rows.length, 4);
  assertEquals(rows[0], ["id", "name", "role"]);
  assertEquals(rows[1], ["1", "Alice", "Engineer"]);
  assertEquals(rows[2], ["2", "Bob, Jr.", "Designer"]);
  assertEquals(rows[3], ["3", "Charlie with\nnewline", "Manager"]);
});

Deno.test("diffCsv - row and cell modifications, additions, and deletions", () => {
  const csvA = `id,name,score
1,Alice,80
2,Bob,90
3,Charlie,75`;

  const csvB = `id,name,score
1,Alice,85
2,Bob,90
4,Dave,95`;

  const diff = diffCsv(csvA, csvB);
  assertEquals(diff.headers, ["id", "name", "score"]);
  assertEquals(diff.totalRowsLeft, 3);
  assertEquals(diff.totalRowsRight, 3);
  assertEquals(diff.rows.length, 3);

  // Row 1 (Alice): modified score 80 -> 85
  assertEquals(diff.rows[0].status, "modified");
  assertEquals(diff.rows[0].cells[2].status, "modified");
  assertEquals(diff.rows[0].cells[2].leftValue, "80");
  assertEquals(diff.rows[0].cells[2].rightValue, "85");

  // Row 2 (Bob): identical
  assertEquals(diff.rows[1].status, "identical");

  // Row 3: Charlie vs Dave (modified)
  assertEquals(diff.rows[2].status, "modified");
  assertEquals(diff.rows[2].cells[1].leftValue, "Charlie");
  assertEquals(diff.rows[2].cells[1].rightValue, "Dave");
});

Deno.test("diffCsv - handles differing row counts (added/deleted rows)", () => {
  const csvA = `id,item
1,Apple
2,Banana`;

  const csvB = `id,item
1,Apple
2,Banana
3,Cherry`;

  const diff = diffCsv(csvA, csvB);
  assertEquals(diff.addedRowsCount, 1);
  assertEquals(diff.rows[2].status, "added");
  assertEquals(diff.rows[2].cells[1].rightValue, "Cherry");
});
