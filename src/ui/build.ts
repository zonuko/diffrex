/**
 * UI バンドルスクリプト。
 * esbuild を用いて src/ui/main.tsx を src/ui/bundle.js にトランスパイル・バンドルする。
 */

import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { fromFileUrl, join, resolve, toFileUrl } from "@std/path";

/**
 * バンドル結果に含まれるパスコメントや改行コードを環境非依存（決定論的）に正規化する。
 * 各環境（OS、ディレクトリ階層の深さ、Deno キャッシュパス）の違いによる差分を排除する。
 */
export function normalizeBundleContent(content: string): string {
  return content
    // 改行コードを LF に統一
    .replace(/\r\n|\r/g, "\n")
    // Deno キャッシュ一時ディレクトリ（deno_esbuild）のパスコメントを正規化
    // 例: // ../../../AppData/Local/deno/deno_esbuild/registry.npmjs.org/preact@10.29.8/...
    //  -> // deno_esbuild/registry.npmjs.org/preact@10.29.8/...
    .replace(
      /^\/\/ .*?[/\\\\]deno_esbuild[/\\\\](.*)$/gm,
      (_match, p1) => `// deno_esbuild/${p1.replace(/\\/g, "/")}`,
    )
    // 万が一 Windows のバックスラッシュが他のファイルコメントに含まれている場合はスラッシュに統一
    .replace(
      /^\/\/ (src[/\\\\][^\r\n]+)$/gm,
      (_match, p1) => `// ${p1.replace(/\\/g, "/")}`,
    );
}

export async function buildUi(options?: { minify?: boolean }): Promise<string> {
  const currentDir = fromFileUrl(new URL(".", import.meta.url));
  const rootDir = resolve(join(currentDir, "../.."));
  const entryPoint = join(currentDir, "main.tsx");
  const outfile = join(currentDir, "bundle.js");
  const configPath = join(rootDir, "deno.json");

  const result = await esbuild.build({
    plugins: [...denoPlugins({ configPath }) as unknown as esbuild.Plugin[]],
    entryPoints: [toFileUrl(entryPoint).href],
    bundle: true,
    format: "esm",
    jsx: "automatic",
    jsxImportSource: "preact",
    outfile,
    absWorkingDir: rootDir,
    minify: options?.minify ?? false,
    write: false,
  });

  if (result.errors.length > 0) {
    throw new Error(`UI build failed: ${JSON.stringify(result.errors)}`);
  }

  const rawText = result.outputFiles?.[0]?.text ?? "";
  const normalized = normalizeBundleContent(rawText);
  await Deno.writeTextFile(outfile, normalized);

  return outfile;
}

if (import.meta.main) {
  try {
    const outfile = await buildUi();
    console.log(`UI successfully built to ${outfile}`);
    esbuild.stop();
  } catch (err) {
    console.error("UI build error:", err);
    esbuild.stop();
    Deno.exit(1);
  }
}
