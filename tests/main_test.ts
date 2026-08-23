import { assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { isDesktopRuntime, runMain, type RunMainOptions } from "../main.ts";

function fixturePath(name: string): string {
  return fromFileUrl(new URL(`./fixtures/${name}`, import.meta.url));
}

/** `runMain` の stderr 出力を捕捉しつつ終了コードを取得する。 */
async function capture(
  args: string[],
  options?: RunMainOptions,
): Promise<{ code: number; stderr: string; stdout: string }> {
  const errLines: string[] = [];
  const outLines: string[] = [];
  const originalErr = console.error;
  const originalLog = console.log;
  console.error = (...parts: unknown[]) => {
    errLines.push(parts.map((part) => String(part)).join(" "));
  };
  console.log = (...parts: unknown[]) => {
    outLines.push(parts.map((part) => String(part)).join(" "));
  };
  try {
    const code = await runMain(args, options);
    return { code, stderr: errLines.join("\n"), stdout: outLines.join("\n") };
  } finally {
    console.error = originalErr;
    console.log = originalLog;
  }
}

Deno.test("runMain: 引数なしで Welcome モードとして起動する", async () => {
  const { code } = await capture([], { autoClose: true });
  assertEquals(code, 0);
});

Deno.test("runMain: 引数 1 個で usage と終了コード 2 を返す", async () => {
  const { code, stderr, stdout } = await capture(["only_one.ts"]);
  assertEquals(code, 2);
  assertStringIncludes(stderr, "insufficient positional arguments");
  assertStringIncludes(stdout, "USAGE:");
});

Deno.test("runMain: --help で usage と終了コード 0 を返す", async () => {
  const { code, stdout } = await capture(["--help"]);
  assertEquals(code, 0);
  assertStringIncludes(stdout, "Diffrex - AI-Friendly Diff & Merge Tool");
});

Deno.test("runMain: --version でバージョンと終了コード 0 を返す", async () => {
  const { code, stdout } = await capture(["--version"]);
  assertEquals(code, 0);
  assertStringIncludes(stdout, "Diffrex v");
});

Deno.test("runMain: 正常な 2-Way 比較引数で正常終了する", async () => {
  const base = fixturePath("sample_base.ts");
  const target = fixturePath("sample_target.ts");
  const { code } = await capture([
    base,
    target,
    "--prompt",
    "test prompt",
    "--agent",
    "Cursor",
    "--model",
    "claude-3-7-sonnet",
  ], { autoClose: true });
  assertEquals(code, 0);
});

Deno.test("runMain: バイナリファイル指定時はエラーと終了コード 3 を返す", async () => {
  const base = fixturePath("sample_base.ts");
  const binary = fixturePath("binary_sample.bin");
  const { code, stderr } = await capture([base, binary], { autoClose: true });
  assertEquals(code, 3);
  assertStringIncludes(stderr, "cannot compare binary file");
});

Deno.test("runMain: 存在しないファイル指定時はエラーと終了コード 3 を返す", async () => {
  const base = fixturePath("sample_base.ts");
  const nonExistent = "non_existent_file_12345.ts";
  const { code, stderr } = await capture([base, nonExistent], {
    autoClose: true,
  });
  assertEquals(code, 3);
  assertStringIncludes(stderr, "Diffrex: error:");
});

Deno.test("isDesktopRuntime: 素の deno run / deno test では false", () => {
  assertEquals(isDesktopRuntime(), false);
});
