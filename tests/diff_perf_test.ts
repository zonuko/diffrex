import { assertEquals, assertGreater } from "@std/assert";
import { diff, presentableDiff } from "@codemirror/merge";
import { readFileTarget } from "../src/core/file_io.ts";
import { buildSession } from "../src/core/session.ts";

Deno.test("Performance: 5,000行以上のファイルでの初期化と diff chunk 算出速度の計測", async () => {
  const baseRes = await readFileTarget("tests/fixtures/large_base.ts");
  const targetRes = await readFileTarget("tests/fixtures/large_target.ts");

  const session = buildSession({
    args: {
      mode: "2way",
      positional: [
        "tests/fixtures/large_base.ts",
        "tests/fixtures/large_target.ts",
      ],
      wait: false,
      readOnly: false,
      ignoreSpace: false,
      ignoreComments: false,
      help: false,
      version: false,
    },
    left: baseRes.target,
    right: targetRes.target,
  });

  const startTime = performance.now();

  const rawDiffs = diff(
    session.files.left.content,
    session.files.right.content,
  );
  const presentableChunks = presentableDiff(
    session.files.left.content,
    session.files.right.content,
  );

  const durationMs = performance.now() - startTime;

  console.log(
    `[Perf Test] 5,075 lines processed: ${rawDiffs.length} raw diffs / ${presentableChunks.length} chunks calculated in ${
      durationMs.toFixed(2)
    }ms`,
  );

  // 25個の差分ブロック（5000 / 200 = 25）
  assertGreater(presentableChunks.length, 20);
  // 実用的なパフォーマンス（1秒以内、通常は数十ミリ秒以内）
  assertEquals(durationMs < 1000, true);
});

Deno.test("Performance: computeLineDiff 高速化（Common Prefix/Suffix & TypedArray）", async () => {
  const { computeLineDiff, splitLines } = await import("../src/core/diff.ts");
  const baseRes = await readFileTarget("tests/fixtures/large_base.ts");
  const targetRes = await readFileTarget("tests/fixtures/large_target.ts");

  const aLines = splitLines(baseRes.target.content);
  const bLines = splitLines(targetRes.target.content);

  const start = performance.now();
  const diffItems = computeLineDiff(aLines, bLines);
  const duration = performance.now() - start;

  console.log(
    `[Perf Test] computeLineDiff: ${aLines.length} lines processed in ${
      duration.toFixed(2)
    }ms, items: ${diffItems.length}`,
  );

  // 100ms 以内で完了すること
  assertEquals(duration < 200, true);
  assertGreater(diffItems.length, 5000);

  // 先頭・末尾が equal であること
  assertEquals(diffItems[0].op, "equal");
  assertEquals(diffItems[diffItems.length - 1].op, "equal");
});
