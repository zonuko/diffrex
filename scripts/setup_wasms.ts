/**
 * Tree-sitter WASM バイナリ一括ダウンロード・セットアップスクリプト。
 *
 * 使い方:
 *   deno run -A scripts/setup_wasms.ts          # 未ダウンロードのもののみ取得
 *   deno run -A scripts/setup_wasms.ts --force  # 強制再ダウンロード
 */

import { exists } from "@std/fs";
import { fromFileUrl, join } from "@std/path";

const WASM_VERSION = "0.1.11";
const BASE_URL = `https://unpkg.com/tree-sitter-wasms@${WASM_VERSION}/out`;

interface WasmTarget {
  lang: string;
  filename: string;
}

const TARGETS: WasmTarget[] = [
  { lang: "typescript", filename: "tree-sitter-typescript.wasm" },
  { lang: "javascript", filename: "tree-sitter-javascript.wasm" },
  { lang: "python", filename: "tree-sitter-python.wasm" },
  { lang: "rust", filename: "tree-sitter-rust.wasm" },
  { lang: "go", filename: "tree-sitter-go.wasm" },
  { lang: "ruby", filename: "tree-sitter-ruby.wasm" },
];

async function main() {
  const isForce = Deno.args.includes("--force");
  const scriptDir = fromFileUrl(new URL(".", import.meta.url));
  const vendorDir = join(scriptDir, "..", "vendor", "tree-sitter");

  await Deno.mkdir(vendorDir, { recursive: true });
  console.log(`[setup_wasms] Target directory: ${vendorDir}`);

  for (const target of TARGETS) {
    const destPath = join(vendorDir, target.filename);
    const fileExists = await exists(destPath);

    if (fileExists && !isForce) {
      const stat = await Deno.stat(destPath);
      console.log(
        `  ✓ ${target.filename} already exists (${
          (stat.size / 1024).toFixed(1)
        } KB) - skipped`,
      );
      continue;
    }

    const url = `${BASE_URL}/${target.filename}`;
    console.log(`  ↓ Downloading ${target.filename} from ${url}...`);

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }
      const bytes = new Uint8Array(await resp.arrayBuffer());
      await Deno.writeFile(destPath, bytes);
      console.log(
        `  ✓ Saved ${target.filename} (${(bytes.length / 1024).toFixed(1)} KB)`,
      );
    } catch (err) {
      console.error(`  ✗ Failed to download ${target.filename}:`, err);
    }
  }

  console.log("[setup_wasms] Done!");
}

if (import.meta.main) {
  await main();
}
