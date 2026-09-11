import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildUi, normalizeBundleContent } from "../src/ui/build.ts";
import { startDesktopServer } from "../src/desktop/window.ts";
import { buildSession } from "../src/core/session.ts";
import { parseCliArgs } from "../src/cli/args.ts";
import * as esbuild from "esbuild";

Deno.test("UI: normalizeBundleContent で環境依存パスコメントと改行が正規化される", () => {
  const input = [
    "// ../../../AppData/Local/deno/deno_esbuild/registry.npmjs.org/preact@10.29.8/dist/preact.module.js\r",
    "var a = 1;\r",
    "// ../../.cache/deno/deno_esbuild/registry.npmjs.org/@codemirror/state@6.7.1/dist/index.js\r",
    "var b = 2;\r",
    "// src\\ui\\model\\observable.ts\r",
    "var c = 3;\r",
  ].join("\n");

  const normalized = normalizeBundleContent(input);

  assertEquals(normalized.includes("\r"), false);
  assertStringIncludes(
    normalized,
    "// deno_esbuild/registry.npmjs.org/preact@10.29.8/dist/preact.module.js",
  );
  assertStringIncludes(
    normalized,
    "// deno_esbuild/registry.npmjs.org/@codemirror/state@6.7.1/dist/index.js",
  );
  assertStringIncludes(normalized, "// src/ui/model/observable.ts");
});

Deno.test("UI: buildUi でバンドルファイルが正常に生成され環境依存パスを含まない", async () => {
  try {
    const outfile = await buildUi();
    const stat = await Deno.stat(outfile);
    assertEquals(stat.isFile, true);
    const content = await Deno.readTextFile(outfile);
    assertStringIncludes(content, "Diffrex");

    // 改行コードが LF に統一されていること
    assertEquals(content.includes("\r"), false);

    // AppData や .cache などのローカルキャッシュパスがバンドルコメントに漏出していないこと
    assertEquals(content.includes("AppData/Local/deno"), false);
    assertEquals(content.includes("AppData\\Local\\deno"), false);
    assertEquals(content.includes(".cache/deno"), false);
  } finally {
    esbuild.stop();
  }
});

Deno.test("DesktopServer: /styles.css と /bundle.js を正しく配信する", async () => {
  const parseRes = parseCliArgs(["base.txt", "target.txt"]);
  assertEquals(parseRes.ok, true);
  if (!parseRes.ok) return;

  const session = buildSession({
    args: parseRes.parsed,
    left: { path: "base.txt", content: "hello", readOnly: true },
    right: { path: "target.txt", content: "world", readOnly: false },
  });

  const server = startDesktopServer(session);

  try {
    // 1. index.html
    const resHtml = await fetch(`${server.url}/`);
    assertEquals(resHtml.status, 200);
    assertEquals(
      resHtml.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    const htmlText = await resHtml.text();
    assertStringIncludes(htmlText, '<div id="root">');
    assertStringIncludes(htmlText, '<script type="module" src="/bundle.js">');

    // 2. styles.css
    const resCss = await fetch(`${server.url}/styles.css`);
    assertEquals(resCss.status, 200);
    assertEquals(
      resCss.headers.get("content-type"),
      "text/css; charset=utf-8",
    );
    const cssText = await resCss.text();
    assertStringIncludes(cssText, "--bg-primary");

    // 3. bundle.js
    const resJs = await fetch(`${server.url}/bundle.js`);
    assertEquals(resJs.status, 200);
    assertEquals(
      resJs.headers.get("content-type"),
      "application/javascript; charset=utf-8",
    );
    const jsText = await resJs.text();
    assertStringIncludes(jsText, "Diffrex");
  } finally {
    await server.close();
  }
});
