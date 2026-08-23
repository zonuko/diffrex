/**
 * OS ネイティブのファイル / フォルダ選択ダイアログ呼び出しモジュール。
 */

export async function openDirectoryDialog(
  _title = "フォルダを選択",
): Promise<string | null> {
  const os = Deno.build.os;

  try {
    if (os === "windows") {
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "${_title}"
$dialog.ShowNewFolderButton = $true
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
if ($dialog.ShowDialog($topForm) -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`;
      const cmd = new Deno.Command("powershell", {
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-WindowStyle",
          "Hidden",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          psScript,
        ],
        stdout: "piped",
        stderr: "null",
      });
      const output = await cmd.output();
      const path = new TextDecoder().decode(output.stdout).trim();
      return path.length > 0 ? path : null;
    } else if (os === "darwin") {
      const cmd = new Deno.Command("osascript", {
        args: ["-e", `POSIX path of (choose folder with prompt "${_title}")`],
        stdout: "piped",
        stderr: "null",
      });
      const output = await cmd.output();
      const path = new TextDecoder().decode(output.stdout).trim();
      return path.length > 0 ? path : null;
    } else {
      // Linux (zenity fallback)
      const cmd = new Deno.Command("zenity", {
        args: ["--file-selection", "--directory", `--title=${_title}`],
        stdout: "piped",
        stderr: "null",
      });
      const output = await cmd.output();
      const path = new TextDecoder().decode(output.stdout).trim();
      return path.length > 0 ? path : null;
    }
  } catch {
    return null;
  }
}

export async function openFileDialog(
  _title = "ファイルを選択",
): Promise<string | null> {
  const os = Deno.build.os;

  try {
    if (os === "windows") {
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "${_title}"
$dialog.Filter = "All Files (*.*)|*.*"
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
if ($dialog.ShowDialog($topForm) -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.FileName
}
`;
      const cmd = new Deno.Command("powershell", {
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-WindowStyle",
          "Hidden",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          psScript,
        ],
        stdout: "piped",
        stderr: "null",
      });
      const output = await cmd.output();
      const path = new TextDecoder().decode(output.stdout).trim();
      return path.length > 0 ? path : null;
    } else if (os === "darwin") {
      const cmd = new Deno.Command("osascript", {
        args: ["-e", `POSIX path of (choose file with prompt "${_title}")`],
        stdout: "piped",
        stderr: "null",
      });
      const output = await cmd.output();
      const path = new TextDecoder().decode(output.stdout).trim();
      return path.length > 0 ? path : null;
    } else {
      // Linux (zenity fallback)
      const cmd = new Deno.Command("zenity", {
        args: ["--file-selection", `--title=${_title}`],
        stdout: "piped",
        stderr: "null",
      });
      const output = await cmd.output();
      const path = new TextDecoder().decode(output.stdout).trim();
      return path.length > 0 ? path : null;
    }
  } catch {
    return null;
  }
}
