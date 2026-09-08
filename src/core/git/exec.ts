/**
 * Git コマンド実行用ユーティリティ。
 * Windows 環境では CREATE_NO_WINDOW (0x08000000) を付与して実行し、
 * コンソールウィンドウ（コマンドプロンプト画面）の一瞬の点滅を完全に防ぐ。
 */

export interface GitCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

// Windows 用 kernel32.dll FFI シンボル（遅延初期化）
// deno-lint-ignore no-explicit-any
let kernel32Instance: any = null;
let ffiFailed = false;

function getKernel32() {
  if (Deno.build.os !== "windows") return null;
  if (ffiFailed) return null;
  if (kernel32Instance) return kernel32Instance;

  try {
    kernel32Instance = Deno.dlopen("kernel32.dll", {
      CreateProcessW: {
        parameters: [
          "buffer", // lpApplicationName
          "buffer", // lpCommandLine
          "pointer", // lpProcessAttributes
          "pointer", // lpThreadAttributes
          "i32", // bInheritHandles
          "u32", // dwCreationFlags
          "pointer", // lpEnvironment
          "buffer", // lpCurrentDirectory
          "buffer", // lpStartupInfo
          "buffer", // lpProcessInformation
        ],
        result: "i32",
      },
      WaitForSingleObject: {
        parameters: ["pointer", "u32"],
        result: "u32",
      },
      GetExitCodeProcess: {
        parameters: ["pointer", "buffer"],
        result: "i32",
      },
      CloseHandle: {
        parameters: ["pointer"],
        result: "i32",
      },
    });
    return kernel32Instance;
  } catch {
    ffiFailed = true;
    return null;
  }
}

function encodeUtf16(str: string): Uint8Array {
  const buf = new Uint8Array((str.length + 1) * 2);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < str.length; i++) {
    view.setUint16(i * 2, str.charCodeAt(i), true);
  }
  view.setUint16(str.length * 2, 0, true);
  return buf;
}

/**
 * Windows 上でコンソールウィンドウを一切表示せずにコマンドを実行する（CREATE_NO_WINDOW）。
 */
async function runSilentWindows(
  args: string[],
  cwd?: string,
): Promise<GitCommandResult | null> {
  const k32 = getKernel32();
  if (!k32) return null;

  let tempOut: string | null = null;
  let tempErr: string | null = null;

  try {
    tempOut = await Deno.makeTempFile({ prefix: "diffrex-git-out-" });
    tempErr = await Deno.makeTempFile({ prefix: "diffrex-git-err-" });

    // 引数を適切にエスケープ
    const escapedArgs = args.map((arg) => {
      if (arg.length === 0) return '""';
      if (/[ \t\n\v"]/.test(arg)) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    }).join(" ");

    // cmd.exe /c 経由でリダイレクトして実行
    const fullCmd =
      `cmd.exe /c git ${escapedArgs} > "${tempOut}" 2> "${tempErr}"`;
    const cmdLineBuf = encodeUtf16(fullCmd);
    const cwdBuf = cwd ? encodeUtf16(cwd) : null;

    // STARTUPINFOW (64-bit Windows: cb = 104 bytes)
    const startupInfo = new Uint8Array(104);
    new DataView(startupInfo.buffer).setUint32(0, 104, true);

    // PROCESS_INFORMATION (24 bytes on 64-bit: hProcess, hThread, dwProcessId, dwThreadId)
    const processInfo = new Uint8Array(24);

    const CREATE_NO_WINDOW = 0x08000000;

    const success = k32.symbols.CreateProcessW(
      null,
      cmdLineBuf,
      null,
      null,
      0, // bInheritHandles = FALSE
      CREATE_NO_WINDOW,
      null,
      cwdBuf,
      startupInfo,
      processInfo,
    );

    if (!success) {
      return null;
    }

    const pView = new DataView(processInfo.buffer);
    const hProcess = Deno.UnsafePointer.create(pView.getBigUint64(0, true));
    const hThread = Deno.UnsafePointer.create(pView.getBigUint64(8, true));

    // プロセス終了を待機（INFINITE = 0xFFFFFFFF）
    k32.symbols.WaitForSingleObject(hProcess, 0xffffffff);

    // 終了コードを取得
    const exitCodeBuf = new Uint8Array(4);
    k32.symbols.GetExitCodeProcess(hProcess, exitCodeBuf);
    const exitCode = new DataView(exitCodeBuf.buffer).getUint32(0, true);

    k32.symbols.CloseHandle(hThread);
    k32.symbols.CloseHandle(hProcess);

    const [stdout, stderr] = await Promise.all([
      Deno.readTextFile(tempOut).catch(() => ""),
      Deno.readTextFile(tempErr).catch(() => ""),
    ]);

    return {
      code: exitCode,
      stdout,
      stderr,
    };
  } catch {
    return null;
  } finally {
    if (tempOut) {
      await Deno.remove(tempOut).catch(() => {});
    }
    if (tempErr) {
      await Deno.remove(tempErr).catch(() => {});
    }
  }
}

/**
 * Git コマンドを実行し、出力を返す。
 * Windows ではコンソールウィンドウのポップアップ（点滅）を完全に抑制する。
 */
export async function runGitCommand(
  args: string[],
  cwd?: string,
): Promise<GitCommandResult> {
  if (Deno.build.os === "windows") {
    const silentRes = await runSilentWindows(args, cwd);
    if (silentRes !== null) {
      return silentRes;
    }
  }

  // 非 Windows または FFI フォールバック
  try {
    const cmd = new Deno.Command("git", {
      args,
      cwd,
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();
    return {
      code: output.code,
      stdout: new TextDecoder().decode(output.stdout),
      stderr: new TextDecoder().decode(output.stderr),
    };
  } catch (err) {
    return {
      code: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    };
  }
}
