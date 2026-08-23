import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl } from "@std/path";

/** `tests/fixtures/` 配下のファイルの絶対パスを返す。 */
function fixturePath(name: string): string {
  return fromFileUrl(new URL(`./fixtures/${name}`, import.meta.url));
}

function readBytes(name: string): Uint8Array {
  return Deno.readFileSync(fixturePath(name));
}

function readText(name: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readBytes(name));
}

const FIXTURES = [
  "sample_base.ts",
  "sample_target.ts",
  "ai_refactor_base.ts",
  "ai_refactor_target.ts",
  "python_base.py",
  "python_target.py",
  "doc_base.md",
  "doc_target.md",
  "crlf_base.txt",
  "crlf_target.txt",
  "no_trailing_newline.txt",
  "utf8_ja.txt",
  "bom_utf8.txt",
  "binary_sample.bin",
];

Deno.test("fixtures: 全ファイルが存在し空でない", () => {
  for (const name of FIXTURES) {
    const stat = Deno.statSync(fixturePath(name));
    assert(stat.isFile, `${name} がファイルとして存在しない`);
    assert(stat.size > 0, `${name} が空`);
  }
});

Deno.test("sample_*.ts: LF のみで末尾改行あり", () => {
  for (const name of ["sample_base.ts", "sample_target.ts"]) {
    const text = readText(name);
    assertEquals(text.includes("\r"), false, `${name} に CR が混入している`);
    assert(text.endsWith("\n"), `${name} が末尾改行で終わっていない`);
  }
});

Deno.test("sample_*.ts: 削除ブロックがちょうど連続12行", () => {
  const start = "// --- (4) DELETED-BLOCK-START";
  const end = "// --- (4) DELETED-BLOCK-END";

  const countBetween = (name: string): number => {
    const lines = readText(name).split("\n");
    const from = lines.findIndex((line) => line.startsWith(start));
    const to = lines.findIndex((line) => line.startsWith(end));
    assert(from >= 0, `${name} に開始マーカーが無い`);
    assert(to > from, `${name} に終了マーカーが無い`);
    return to - from - 1;
  };

  assertEquals(countBetween("sample_base.ts"), 12);
  assertEquals(countBetween("sample_target.ts"), 0);
});

Deno.test("sample_*.ts: インデントのみ変更 / コメントのみ変更を含む", () => {
  const base = readText("sample_base.ts").split("\n");
  const target = readText("sample_target.ts").split("\n");

  // (2) インデントのみ変更: 生の行は異なるが trim すると一致する。
  const baseLabel = base.find((line) => line.includes("const label = name"))!;
  const targetLabel = target.find((line) =>
    line.includes("const label = name")
  )!;
  assert(baseLabel !== targetLabel, "インデント差分が無い");
  assertEquals(baseLabel.trim(), targetLabel.trim());

  // (3) コメントのみ変更: コメント行だけが違い、コードは同じ。
  assertStringIncludes(
    base.find((line) => line.includes("key=value"))!,
    "パースする",
  );
  assertStringIncludes(
    target.find((line) => line.includes("key=value"))!,
    "解析する",
  );

  // (1) ロジック変更 / (5) シグネチャ変更。
  assertStringIncludes(readText("sample_base.ts"), "return total * 1.08;");
  assertStringIncludes(readText("sample_target.ts"), "return total * 1.10;");
  assertStringIncludes(
    readText("sample_base.ts"),
    "applyDiscount(price: number)",
  );
  assertStringIncludes(
    readText("sample_target.ts"),
    "applyDiscount(price: number, rate: number)",
  );
});

Deno.test("crlf_*.txt: 改行が全て CRLF で保持されている", () => {
  for (const name of ["crlf_base.txt", "crlf_target.txt"]) {
    const bytes = readBytes(name);
    let lf = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] !== 0x0A) continue;
      lf++;
      assertEquals(
        bytes[i - 1],
        0x0D,
        `${name} に単独 LF がある (offset ${i})`,
      );
    }
    assert(lf > 0, `${name} に改行が無い`);
    assertEquals(bytes.at(-1), 0x0A, `${name} が末尾改行で終わっていない`);
  }
});

Deno.test("no_trailing_newline.txt: 末尾が改行で終わらない", () => {
  const bytes = readBytes("no_trailing_newline.txt");
  assert(bytes.at(-1) !== 0x0A, "末尾が LF になっている");
  assert(bytes.at(-1) !== 0x0D, "末尾が CR になっている");
  assertStringIncludes(readText("no_trailing_newline.txt"), "\n");
});

Deno.test("utf8_ja.txt: BOM なしの UTF-8 として復号でき日本語を含む", () => {
  const bytes = readBytes("utf8_ja.txt");
  assert(
    !(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF),
    "BOM が付いている",
  );

  const text = readText("utf8_ja.txt");
  assertStringIncludes(text, "日本語のマルチバイト文字列です。");
  assertStringIncludes(text, "全角スペース　とタブ\t");
  assertStringIncludes(text, "🍣");
  // マルチバイトなのでバイト長は文字数より大きい。
  assert(bytes.length > text.length);
});

Deno.test("bom_utf8.txt: EF BB BF で始まる", () => {
  const bytes = readBytes("bom_utf8.txt");
  assertEquals([bytes[0], bytes[1], bytes[2]], [0xEF, 0xBB, 0xBF]);
  assertStringIncludes(readText("bom_utf8.txt"), "BOM 付き UTF-8");
});

Deno.test("binary_sample.bin: NUL バイトを含む", () => {
  const bytes = readBytes("binary_sample.bin");
  assert(bytes.includes(0x00), "NUL バイトが含まれていない");
});
