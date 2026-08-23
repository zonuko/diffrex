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
