import { assertEquals, assertMatch } from "@std/assert";
import { parseCliArgs } from "../src/cli/args.ts";
import { validateCliArgs } from "../src/cli/validate.ts";

Deno.test("parseCliArgs: 2-Way 引数の正常系パース", () => {
  const res = parseCliArgs(["base.ts", "target.ts"]);
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.parsed.mode, "2way");
    assertEquals(res.parsed.left, "base.ts");
    assertEquals(res.parsed.right, "target.ts");
    assertEquals(res.parsed.base, undefined);
    assertEquals(res.parsed.output, undefined);
    assertEquals(res.parsed.readOnly, false);
  }
});

Deno.test("parseCliArgs: '--' (deno task の引数区切り) を無視してパースできる", () => {
  const res = parseCliArgs(["--", "base.ts", "target.ts", "--prompt", "test"]);
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.parsed.mode, "2way");
    assertEquals(res.parsed.left, "base.ts");
    assertEquals(res.parsed.right, "target.ts");
    assertEquals(res.parsed.prompt, "test");
  }
});

Deno.test("parseCliArgs: 3-Way 引数の正常系パース (デフォルト出力先は <local>)", () => {
  const res = parseCliArgs(["local.ts", "base.ts", "remote.ts"]);
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.parsed.mode, "3way");
    assertEquals(res.parsed.left, "local.ts");
    assertEquals(res.parsed.base, "base.ts");
    assertEquals(res.parsed.right, "remote.ts");
    assertEquals(res.parsed.output, "local.ts");
  }
});

Deno.test("parseCliArgs: 3-Way 引数で -o / --output 明示指定", () => {
  const res = parseCliArgs([
    "local.ts",
    "base.ts",
    "remote.ts",
    "-o",
    "out.ts",
  ]);
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.parsed.output, "out.ts");
  }
});

Deno.test("parseCliArgs: stdin パイプ入力 ('-')", () => {
  const res = parseCliArgs(["-"]);
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.parsed.mode, "stdin");
    assertEquals(res.parsed.left, "-");
    assertEquals(res.parsed.right, "-");
    assertEquals(res.parsed.readOnly, true);
  }
});

Deno.test("parseCliArgs: 各種オプションフラグのパース", () => {
  const res = parseCliArgs([
    "base.ts",
    "target.ts",
    "--prompt",
    "test prompt",
    "--agent",
    "Claude Code",
    "--model",
    "claude-3-7-sonnet",
    "-w",
    "--read-only",
    "--ignore-space",
    "--ignore-comments",
  ]);
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.parsed.prompt, "test prompt");
    assertEquals(res.parsed.agent, "Claude Code");
    assertEquals(res.parsed.model, "claude-3-7-sonnet");
    assertEquals(res.parsed.wait, true);
    assertEquals(res.parsed.readOnly, true);
    assertEquals(res.parsed.ignoreSpace, true);
    assertEquals(res.parsed.ignoreComments, true);
  }
});

Deno.test("parseCliArgs: 未知のフラグでエラー (exit code 2)", () => {
  const res = parseCliArgs(["base.ts", "target.ts", "--unknown-flag"]);
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.exitCode, 2);
    assertMatch(res.error, /unknown option: '--unknown-flag'/);
  }
});

Deno.test("validateCliArgs: --help や --version 指定時はファイル検証スキップ", async () => {
  const parseRes = parseCliArgs(["non_existent.ts", "--help"]);
  assertEquals(parseRes.ok, true);
  if (parseRes.ok) {
    const validRes = await validateCliArgs(parseRes.parsed);
    assertEquals(validRes.ok, true);
  }
});

Deno.test("validateCliArgs: 位置引数 0 個で welcome モードとして成功", async () => {
  const parseRes = parseCliArgs([]);
  assertEquals(parseRes.ok, true);
  if (parseRes.ok) {
    const validRes = await validateCliArgs(parseRes.parsed);
    assertEquals(validRes.ok, true);
    assertEquals(parseRes.parsed.mode, "welcome");
  }
});

Deno.test("validateCliArgs: 位置引数 1 個 (非 stdin) でエラー (exit code 2)", async () => {
  const parseRes = parseCliArgs(["only_one.ts"]);
  assertEquals(parseRes.ok, true);
  if (parseRes.ok) {
    const validRes = await validateCliArgs(parseRes.parsed);
    assertEquals(validRes.ok, false);
    if (!validRes.ok) {
      assertEquals(validRes.exitCode, 2);
      assertEquals(validRes.showUsage, true);
    }
  }
});

Deno.test("validateCliArgs: 位置引数 4 個以上でエラー (exit code 2)", async () => {
  const parseRes = parseCliArgs(["a", "b", "c", "d"]);
  assertEquals(parseRes.ok, true);
  if (parseRes.ok) {
    const validRes = await validateCliArgs(parseRes.parsed);
    assertEquals(validRes.ok, false);
    if (!validRes.ok) {
      assertEquals(validRes.exitCode, 2);
      assertEquals(validRes.showUsage, true);
    }
  }
});

Deno.test("validateCliArgs: 実在するサンプルファイルの検証成功", async () => {
  const parseRes = parseCliArgs([
    "tests/fixtures/sample_base.ts",
    "tests/fixtures/sample_target.ts",
  ]);
  assertEquals(parseRes.ok, true);
  if (parseRes.ok) {
    const validRes = await validateCliArgs(parseRes.parsed);
    assertEquals(validRes.ok, true);
  }
});

Deno.test("validateCliArgs: 存在しないファイルでエラー (exit code 3)", async () => {
  const parseRes = parseCliArgs([
    "tests/fixtures/sample_base.ts",
    "tests/fixtures/does_not_exist.ts",
  ]);
  assertEquals(parseRes.ok, true);
  if (parseRes.ok) {
    const validRes = await validateCliArgs(parseRes.parsed);
    assertEquals(validRes.ok, false);
    if (!validRes.ok) {
      assertEquals(validRes.exitCode, 3);
      assertMatch(
        validRes.error,
        /file 'tests\/fixtures\/does_not_exist\.ts' does not exist/,
      );
    }
  }
});

Deno.test("validateCliArgs: ディレクトリとファイルの混在でエラー (exit code 3)", async () => {
  const parseRes = parseCliArgs([
    "tests/fixtures",
    "tests/fixtures/sample_target.ts",
  ]);
  assertEquals(parseRes.ok, true);
  if (parseRes.ok) {
    const validRes = await validateCliArgs(parseRes.parsed);
    assertEquals(validRes.ok, false);
    if (!validRes.ok) {
      assertEquals(validRes.exitCode, 3);
      assertMatch(validRes.error, /cannot compare a file with a directory/);
    }
  }
});
