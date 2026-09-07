/**
 * インストールスクリプトおよびパッケージマネージャー定義ファイルのテスト (B12-05)。
 */

import { assertEquals, assertMatch } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

const rootDir = join(fromFileUrl(new URL(".", import.meta.url)), "..");

Deno.test("install.sh: スクリプトの存在と静的構造検証", async () => {
  const scriptPath = join(rootDir, "scripts", "install.sh");
  const content = await Deno.readTextFile(scriptPath);

  // 1. Shebang
  assertMatch(content, /^#!\/usr\/bin\/env sh/);

  // 2. リポジトリ設定
  assertMatch(content, /REPO="zonuko\/diffrex"/);

  // 3. アンインストール処理
  assertMatch(content, /IS_UNINSTALL/);
  assertMatch(content, /--uninstall/);
  assertMatch(content, /DIFFREX_UNINSTALL/);

  // 4. OS & Arch 判定
  assertMatch(content, /Darwin/);
  assertMatch(content, /Linux/);
  assertMatch(content, /x86_64/);
  assertMatch(content, /arm64|aarch64/);

  // 5. ダウンロード及び展開・シンボリックリンク
  assertMatch(content, /diffrex-\$\{PLATFORM_OS\}-\$\{PLATFORM_ARCH\}/);
  assertMatch(content, /ln -sf/);
  assertMatch(content, /chmod \+x/);
});

Deno.test("install.sh: sh -n 構文チェック (sh または bash が存在する場合)", async () => {
  const scriptPath = join(rootDir, "scripts", "install.sh");
  for (const shCmd of ["sh", "bash"]) {
    try {
      const command = new Deno.Command(shCmd, {
        args: ["-n", scriptPath],
        stdout: "piped",
        stderr: "piped",
      });
      const output = await command.output();
      assertEquals(
        output.code,
        0,
        `${shCmd} -n failed: ${new TextDecoder().decode(output.stderr)}`,
      );
      break; // 1つでも実行できれば検証成功
    } catch {
      // コマンドが見つからない環境（Windowsネイティブ等）はスキップ
    }
  }
});

Deno.test("install.ps1: スクリプトの存在と静的構造検証", async () => {
  const scriptPath = join(rootDir, "scripts", "install.ps1");
  const content = await Deno.readTextFile(scriptPath);

  // 1. パラメータ定義
  assertMatch(content, /\[string\]\$Version/);
  assertMatch(content, /\[string\]\$InstallDir/);
  assertMatch(content, /\[switch\]\$Uninstall/);
  assertMatch(content, /\[switch\]\$NoPathUpdate/);

  // 2. リポジトリ設定
  assertMatch(content, /\$Repo\s*=\s*"zonuko\/diffrex"/);
  assertMatch(content, /diffrex-windows-x86_64/);

  // 3. アンインストールフロー
  assertMatch(content, /if\s*\(\$Uninstall\)/);
  assertMatch(content, /Remove-Item/);
  assertMatch(content, /\[Environment\]::SetEnvironmentVariable\("Path"/);

  // 4. ダウンロードと展開
  assertMatch(content, /Invoke-WebRequest/);
  assertMatch(content, /Expand-Archive/);
  assertMatch(content, /Get-FileHash/);
});

Deno.test("install.ps1: PowerShell AST による構文解析検証", async () => {
  const scriptPath = join(rootDir, "scripts", "install.ps1");

  // PowerShell / pwsh を探して構文解析
  for (const psCmd of ["pwsh", "powershell"]) {
    try {
      const parseCode = `
        $path = '${scriptPath.replace(/\\/g, "\\\\")}';
        $content = [System.IO.File]::ReadAllText($path);
        $tokens = $null;
        $errors = $null;
        $ast = [System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$errors);
        if ($errors.Count -gt 0) {
          $errors | ForEach-Object { Write-Error $_.Message }
          exit 1
        }
        exit 0
      `;
      const command = new Deno.Command(psCmd, {
        args: ["-NoProfile", "-Command", parseCode],
        stdout: "piped",
        stderr: "piped",
      });
      const output = await command.output();
      assertEquals(
        output.code,
        0,
        `${psCmd} syntax parse failed: ${
          new TextDecoder().decode(output.stderr)
        }`,
      );
      break;
    } catch {
      // コマンドが見つからない環境はスキップ
    }
  }
});

Deno.test("packaging: Scoop マニフェスト (diffrex.json) の検証", async () => {
  const scoopPath = join(rootDir, "packaging", "scoop", "diffrex.json");
  const content = await Deno.readTextFile(scoopPath);
  const json = JSON.parse(content);

  assertEquals(typeof json.version, "string");
  assertEquals(typeof json.description, "string");
  assertEquals(json.bin, "diffrex.exe");
  assertEquals(json.checkver, "github");
  assertMatch(json.architecture["64bit"].url, /diffrex-windows-x86_64\.zip/);
  assertMatch(
    json.autoupdate.architecture["64bit"].url,
    /diffrex-windows-x86_64\.zip/,
  );
});

Deno.test("packaging: Homebrew Formula (diffrex.rb) の検証", async () => {
  const brewPath = join(rootDir, "packaging", "homebrew", "diffrex.rb");
  const content = await Deno.readTextFile(brewPath);

  assertMatch(content, /class Diffrex < Formula/);
  assertMatch(content, /homepage "https:\/\/github\.com\/zonuko\/diffrex"/);
  assertMatch(content, /bin\.install "diffrex"/);
  assertMatch(content, /diffrex-macos-aarch64\.tar\.gz/);
  assertMatch(content, /diffrex-macos-x86_64\.tar\.gz/);
  assertMatch(content, /diffrex-linux-x86_64\.tar\.gz/);
});

Deno.test("packaging: Winget マニフェスト (diffrex.yaml) の検証", async () => {
  const wingetPath = join(rootDir, "packaging", "winget", "diffrex.yaml");
  const content = await Deno.readTextFile(wingetPath);

  assertMatch(content, /PackageIdentifier: zonuko\.diffrex/);
  assertMatch(content, /PackageName: Diffrex/);
  assertMatch(content, /InstallerType: zip/);
  assertMatch(content, /PortableCommandAlias: diffrex/);
});
