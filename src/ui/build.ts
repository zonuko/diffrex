/**
 * UI バンドルスクリプト。
 * esbuild を用いて src/ui/main.tsx を src/ui/bundle.js にトランスパイル・バンドルする。
 */

import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { fromFileUrl, join, toFileUrl } from "@std/path";

export async function buildUi(options?: { minify?: boolean }): Promise<string> {
  const currentDir = fromFileUrl(new URL(".", import.meta.url));
  const entryPoint = join(currentDir, "main.tsx");
  const outfile = join(currentDir, "bundle.js");
  const configPath = join(currentDir, "../../deno.json");

  const result = await esbuild.build({
    plugins: [...denoPlugins({ configPath }) as unknown as esbuild.Plugin[]],
    entryPoints: [toFileUrl(entryPoint).href],
    bundle: true,
    format: "esm",
    jsx: "automatic",
    jsxImportSource: "preact",
    outfile,
    minify: options?.minify ?? false,
    write: true,
  });

  if (result.errors.length > 0) {
    throw new Error(`UI build failed: ${JSON.stringify(result.errors)}`);
  }

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
