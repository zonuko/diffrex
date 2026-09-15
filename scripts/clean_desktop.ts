/**
 * 残存した Deno Desktop (laufey_webview) プロセスおよびキャッシュ DLL を安全に終了・クリーンアップするスクリプト。
 */

if (Deno.build.os === "windows") {
  const killCmd = new Deno.Command("powershell", {
    args: [
      "-NoProfile",
      "-Command",
      'Get-Process | Where-Object { $_.ProcessName -like "*laufey*" -or $_.ProcessName -like "*diffrex*" } | Stop-Process -Force -ErrorAction SilentlyContinue',
    ],
  });
  await killCmd.output();

  // ワークスペース内の diffrex キャッシュディレクトリ削除を試行
  try {
    await Deno.remove("diffrex", { recursive: true });
  } catch {
    // ignore
  }

  // キャッシュディレクトリ内の DLL / キャッシュディレクトリ削除を試行
  const localAppData = Deno.env.get("LOCALAPPDATA");
  if (localAppData) {
    const desktopDir = `${localAppData}\\deno\\desktop`;
    try {
      for await (const entry of Deno.readDir(desktopDir)) {
        if (entry.isDirectory) {
          const targetSubDir = `${desktopDir}\\${entry.name}`;
          try {
            await Deno.remove(targetSubDir, { recursive: true });
            console.log(`Cleaned cached desktop dir: ${targetSubDir}`);
          } catch {
            // ディレクトリ削除できない場合、DLL 個別削除を試行
            for (const dllName of ["diffrex.dll", "Diffrex.dll"]) {
              try {
                await Deno.remove(`${targetSubDir}\\${dllName}`);
                console.log(`Cleaned cached DLL: ${targetSubDir}\\${dllName}`);
              } catch {
                // ignore
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
}

console.log("Desktop runtime cleaned successfully.");
