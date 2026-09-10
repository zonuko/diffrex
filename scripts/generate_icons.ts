/**
 * Diffrex アプリアイコン生成タスクスクリプト。
 */
import { join } from "@std/path";

async function main() {
  const assetsDir = join(Deno.cwd(), "assets");
  await Deno.mkdir(assetsDir, { recursive: true });

  if (Deno.build.os === "windows") {
    const cmd = new Deno.Command("powershell", {
      args: [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "scripts/generate_icons.ps1",
      ],
    });
    const output = await cmd.output();
    if (!output.success) {
      console.error(new TextDecoder().decode(output.stderr));
      Deno.exit(1);
    }
    console.log(new TextDecoder().decode(output.stdout));
  } else {
    console.log("Assets are pre-generated in assets/ directory.");
  }
}

if (import.meta.main) {
  await main();
}
