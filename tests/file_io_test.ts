import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { fromFileUrl } from "@std/path";
import {
  decodeUtf8,
  detectLineEnding,
  detectTrailingNewline,
  encodeWithMetadata,
  hasUtf8Bom,
  isBinary,
  readFileTarget,
  readStdinTarget,
} from "../src/core/file_io.ts";

function fixturePath(name: string): string {
  return fromFileUrl(new URL(`./fixtures/${name}`, import.meta.url));
}

Deno.test("isBinary: NUL バイトを検出できる", () => {
  assertEquals(isBinary(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f])), false);
  assertEquals(isBinary(new Uint8Array([0x68, 0x00, 0x6c])), true);
});

Deno.test("hasUtf8Bom: BOM の有無を判定できる", () => {
  assertEquals(hasUtf8Bom(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])), true);
  assertEquals(hasUtf8Bom(new Uint8Array([0x61, 0x62, 0x63])), false);
  assertEquals(hasUtf8Bom(new Uint8Array([0xef, 0xbb])), false);
});

Deno.test("detectLineEnding: LF / CRLF を判定できる", () => {
  assertEquals(detectLineEnding("hello\nworld\n"), "lf");
  assertEquals(detectLineEnding("hello\r\nworld\r\n"), "crlf");
  assertEquals(detectLineEnding("single line"), "lf");
});

Deno.test("detectTrailingNewline: 末尾改行の有無を判定できる", () => {
  assertEquals(detectTrailingNewline("line1\nline2\n"), true);
  assertEquals(detectTrailingNewline("line1\r\nline2\r\n"), true);
  assertEquals(detectTrailingNewline("line1\nline2"), false);
});

Deno.test("decodeUtf8: BOM を除去して正しくデコードできる", () => {
  const bytesWithBom = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x62, 0x63]);
  const text = decodeUtf8(bytesWithBom);
  assertEquals(text, "abc");
});

Deno.test("readFileTarget: 正常な UTF-8 ファイルを読み込める", async () => {
  const path = fixturePath("sample_base.ts");
  const res = await readFileTarget(path);
  assertEquals(res.target.path, path);
  assertEquals(res.target.readOnly, false);
  assertStringIncludes(res.target.content, "calcTotal");
  assertEquals(res.meta.lineEnding, "lf");
  assertEquals(res.meta.hasTrailingNewline, true);
  assertEquals(res.meta.hasBom, false);
});

Deno.test("readFileTarget: options.readOnly が true なら readOnly: true", async () => {
  const path = fixturePath("sample_base.ts");
  const res = await readFileTarget(path, { readOnly: true });
  assertEquals(res.target.readOnly, true);
});

Deno.test("readFileTarget: CRLF ファイルのメタデータを保持する", async () => {
  const path = fixturePath("crlf_base.txt");
  const res = await readFileTarget(path);
  assertEquals(res.meta.lineEnding, "crlf");
  assertEquals(res.meta.hasTrailingNewline, true);
});

Deno.test("readFileTarget: 末尾改行なしファイルのメタデータを保持する", async () => {
  const path = fixturePath("no_trailing_newline.txt");
  const res = await readFileTarget(path);
  assertEquals(res.meta.hasTrailingNewline, false);
});

Deno.test("readFileTarget: BOM 付き UTF-8 ファイルを読み込み BOM を除去しつつ保持する", async () => {
  const path = fixturePath("bom_utf8.txt");
  const res = await readFileTarget(path);
  assertEquals(res.meta.hasBom, true);
  // content 自体からは BOM が除去されている
  assert(!res.target.content.startsWith("\ufeff"));
  assertStringIncludes(res.target.content, "BOM 付き UTF-8");
});

Deno.test("readFileTarget: バイナリファイルを拒否してエラーを投げる", async () => {
  const path = fixturePath("binary_sample.bin");
  await assertRejects(
    async () => {
      await readFileTarget(path);
    },
    Error,
    "cannot compare binary file",
  );
});

Deno.test("encodeWithMetadata: 元の改行・BOM・末尾改行を復元してエンコードできる", () => {
  const meta = {
    lineEnding: "crlf" as const,
    hasTrailingNewline: false,
    hasBom: true,
  };
  const encoded = encodeWithMetadata("line1\nline2\n", meta);
  assertEquals(hasUtf8Bom(encoded), true);
  const text = new TextDecoder().decode(encoded.subarray(3));
  assertEquals(text, "line1\r\nline2");
});

Deno.test("readStdinTarget: ターミナル時はエラーを投げる", async () => {
  if (Deno.stdin.isTerminal()) {
    await assertRejects(
      async () => {
        await readStdinTarget();
      },
      Error,
      "cannot read from stdin: standard input is an interactive terminal",
    );
  }
});
