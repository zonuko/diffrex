/**
 * 残存した Deno Desktop (laufey_webview) プロセスおよびキャッシュ DLL を安全に終了・クリーンアップするスクリプト。
 */

if (Deno.build.os === "windows") {
  const killCmd = new Deno.Command("powershell", {
    args: [
      "-NoProfile",
      "-Command",
      'Get-Process | Where-Object { $_.ProcessName -like "*laufey*" } | Stop-Process -Force -ErrorAction SilentlyContinue',
    ],
  });
  await killCmd.output();

  // キャッシュディレクトリ内の Diffrex.dll 削除を試行
  const localAppData = Deno.env.get("LOCALAPPDATA");
  if (localAppData) {
    const desktopDir = `${localAppData}\\deno\\desktop`;
    try {
      for await (const entry of Deno.readDir(desktopDir)) {
        if (entry.isDirectory) {
          const dllPath = `${desktopDir}\\${entry.name}\\Diffrex.dll`;
          try {
            await Deno.remove(dllPath);
            console.log(`Cleaned cached DLL: ${dllPath}`);
          } catch {
            // ignore if not present or in use
          }
        }
      }
    } catch {
      // ignore
    }
  }
}

console.log("Desktop runtime cleaned successfully.");
