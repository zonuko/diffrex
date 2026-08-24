/**
 * OS コンテキストメニュー & シェル統合（B6-01）。
 *
 * Windows エクスプローラー、macOS Finder、Linux ファイルマネージャーとの右クリックメニュー統合を提供する。
 */

export type SupportedOs = "windows" | "darwin" | "linux";

export function detectOs(): SupportedOs {
  const os = Deno.build.os;
  if (os === "windows" || os === "darwin" || os === "linux") {
    return os;
  }
  return "linux";
}

/**
 * Diffrex 実行バイナリのパスを取得する。
 */
export function getDiffrexExecutablePath(): string {
  try {
    return Deno.execPath();
  } catch {
    return "diffrex";
  }
}

/**
 * Windows レジストリ（.reg）スクリプトを生成する。
 */
export function generateWindowsRegistryScript(execPath?: string): string {
  const targetPath = (execPath || getDiffrexExecutablePath()).replace(
    /\\/g,
    "\\\\",
  );

  return `Windows Registry Editor Version 5.00

; ====================================================================
; Diffrex - Windows Explorer Context Menu Integration
; ====================================================================

; --- Files: Compare with Diffrex ---
[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\Diffrex]
@="Compare with Diffrex"
"Icon"="\\"${targetPath}\\""

[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\Diffrex\\command]
@="\\"${targetPath}\\" \\"%1\\""

; --- Directories: Compare with Diffrex ---
[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\Diffrex]
@="Compare with Diffrex"
"Icon"="\\"${targetPath}\\""

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\Diffrex\\command]
@="\\"${targetPath}\\" \\"%1\\""

; --- Directory Background: Open Diffrex ---
[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\Diffrex]
@="Open Diffrex Here"
"Icon"="\\"${targetPath}\\""

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\Diffrex\\command]
@="\\"${targetPath}\\" \\"%V\\""
`;
}

/**
 * Windows レジストリ削除（.reg）スクリプトを生成する。
 */
export function generateWindowsRegistryUninstallScript(): string {
  return `Windows Registry Editor Version 5.00

; Remove Diffrex context menu entries
[-HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\Diffrex]
[-HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\Diffrex]
[-HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\Diffrex]
`;
}

/**
 * macOS Finder Quick Action / Automator スクリプトを生成する。
 */
export function generateMacOSFinderScript(execPath?: string): string {
  const targetPath = execPath || getDiffrexExecutablePath();
  return `#!/usr/bin/env bash
# macOS Finder Service / Quick Action for Diffrex
# Usage: Run with 1 or 2 selected items

DIFFREX_BIN="${targetPath}"

if [ "$#" -eq 0 ]; then
  "$DIFFREX_BIN" &
elif [ "$#" -eq 1 ]; then
  "$DIFFREX_BIN" "$1" &
elif [ "$#" -ge 2 ]; then
  "$DIFFREX_BIN" "$1" "$2" &
fi
`;
}

/**
 * Linux XDG .desktop エントリを生成する。
 */
export function generateLinuxDesktopEntry(execPath?: string): string {
  const targetPath = execPath || getDiffrexExecutablePath();
  return `[Desktop Entry]
Type=Application
Name=Diffrex
Comment=AI-Friendly Diff & Merge Tool
Exec="${targetPath}" %F
Icon=diffrex
Terminal=false
Categories=Development;Utility;
MimeType=text/plain;application/x-zerosize;inode/directory;
`;
}

export interface ContextMenuResult {
  ok: boolean;
  message: string;
  script?: string;
}

/**
 * OS コンテキストメニュー登録スクリプトを生成する。
 */
export function generateContextMenuScript(
  os?: SupportedOs,
  execPath?: string,
): ContextMenuResult {
  const currentOs = os || detectOs();
  if (currentOs === "windows") {
    const script = generateWindowsRegistryScript(execPath);
    return {
      ok: true,
      message: "Windows レジストリ登録スクリプト（.reg）を生成しました。",
      script,
    };
  } else if (currentOs === "darwin") {
    const script = generateMacOSFinderScript(execPath);
    return {
      ok: true,
      message: "macOS Finder Quick Action スクリプトを生成しました。",
      script,
    };
  } else {
    const script = generateLinuxDesktopEntry(execPath);
    return {
      ok: true,
      message: "Linux .desktop エントリを生成しました。",
      script,
    };
  }
}

/**
 * コンテキストメニューを OS に登録・インストールする。
 */
export async function installContextMenu(
  os?: SupportedOs,
  execPath?: string,
): Promise<ContextMenuResult> {
  const currentOs = os || detectOs();
  const targetExec = execPath || getDiffrexExecutablePath();

  if (currentOs === "windows") {
    try {
      const regScript = generateWindowsRegistryScript(targetExec);
      const tempRegPath = await Deno.makeTempFile({ suffix: ".reg" });
      await Deno.writeTextFile(tempRegPath, regScript);

      const command = new Deno.Command("reg.exe", {
        args: ["import", tempRegPath],
      });
      const output = await command.output();
      try {
        await Deno.remove(tempRegPath);
      } catch {
        // ignore temp removal error
      }

      if (output.success) {
        return {
          ok: true,
          message:
            "Windows エクスプローラーのコンテキストメニューに Diffrex を登録しました。",
        };
      } else {
        const errorText = new TextDecoder().decode(output.stderr);
        return {
          ok: false,
          message: `レジストリ登録に失敗しました: ${errorText}`,
          script: regScript,
        };
      }
    } catch (err) {
      return {
        ok: false,
        message: `コンテキストメニュー登録中にエラーが発生しました: ${
          err instanceof Error ? err.message : String(err)
        }`,
        script: generateWindowsRegistryScript(targetExec),
      };
    }
  } else if (currentOs === "darwin") {
    // macOS: script output guidance
    const script = generateMacOSFinderScript(targetExec);
    return {
      ok: true,
      message:
        "macOS Finder Quick Action スクリプトを出力しました。Automator / Quick Actions に設定してください。",
      script,
    };
  } else {
    // Linux: write to ~/.local/share/applications/diffrex.desktop
    try {
      const home = Deno.env.get("HOME") || "";
      if (home) {
        const appsDir = `${home}/.local/share/applications`;
        await Deno.mkdir(appsDir, { recursive: true });
        const desktopFile = `${appsDir}/diffrex.desktop`;
        const content = generateLinuxDesktopEntry(targetExec);
        await Deno.writeTextFile(desktopFile, content);
        return {
          ok: true,
          message: `${desktopFile} に Diffrex を登録しました。`,
          script: content,
        };
      }
    } catch {
      // fallback
    }
    return {
      ok: true,
      message: "Linux .desktop エントリを出力しました。",
      script: generateLinuxDesktopEntry(targetExec),
    };
  }
}

/**
 * コンテキストメニューを OS から削除・アンインストールする。
 */
export async function uninstallContextMenu(
  os?: SupportedOs,
): Promise<ContextMenuResult> {
  const currentOs = os || detectOs();

  if (currentOs === "windows") {
    try {
      const regScript = generateWindowsRegistryUninstallScript();
      const tempRegPath = await Deno.makeTempFile({ suffix: ".reg" });
      await Deno.writeTextFile(tempRegPath, regScript);

      const command = new Deno.Command("reg.exe", {
        args: ["import", tempRegPath],
      });
      const output = await command.output();
      try {
        await Deno.remove(tempRegPath);
      } catch {
        // ignore temp removal error
      }

      if (output.success) {
        return {
          ok: true,
          message:
            "Windows エクスプローラーのコンテキストメニューから Diffrex を削除しました。",
        };
      } else {
        const errorText = new TextDecoder().decode(output.stderr);
        return {
          ok: false,
          message: `レジストリ削除に失敗しました: ${errorText}`,
          script: regScript,
        };
      }
    } catch (err) {
      return {
        ok: false,
        message: `コンテキストメニュー削除中にエラーが発生しました: ${
          err instanceof Error ? err.message : String(err)
        }`,
        script: generateWindowsRegistryUninstallScript(),
      };
    }
  } else if (currentOs === "darwin") {
    return {
      ok: true,
      message:
        "macOS Finder Quick Actions から登録した Diffrex サービスを削除してください。",
    };
  } else {
    try {
      const home = Deno.env.get("HOME") || "";
      if (home) {
        const desktopFile = `${home}/.local/share/applications/diffrex.desktop`;
        await Deno.remove(desktopFile);
        return {
          ok: true,
          message: `${desktopFile} を削除しました。`,
        };
      }
    } catch {
      // ignore
    }
    return {
      ok: true,
      message: "Linux .desktop エントリの削除を完了しました。",
    };
  }
}
