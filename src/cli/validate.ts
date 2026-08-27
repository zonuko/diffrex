/**
 * Diffrex の CLI 引数バリデーションおよびファイル存在チェック（P1-03）。
 */

import type { ParsedCliArgs } from "./args.ts";

export interface ValidationSuccess {
  ok: true;
}

export interface ValidationError {
  ok: false;
  error: string;
  exitCode: number; // 2: 引数・usage エラー, 3: I/O・ファイルアクセスエラー
  showUsage?: boolean;
}

export type ValidationResult = ValidationSuccess | ValidationError;

/**
 * ファイルの存在と種別（ディレクトリでないか）をチェックする。
 */
async function checkFilePath(path: string): Promise<ValidationError | null> {
  if (path === "-") {
    return null; // stdin
  }

  try {
    const stat = await Deno.stat(path);
    if (stat.isDirectory) {
      return {
        ok: false,
        error: `'${path}' is a directory, not a file`,
        exitCode: 3,
      };
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return {
        ok: false,
        error: `file '${path}' does not exist`,
        exitCode: 3,
      };
    }
    if (err instanceof Deno.errors.PermissionDenied) {
      return {
        ok: false,
        error: `permission denied for '${path}'`,
        exitCode: 3,
      };
    }
    return {
      ok: false,
      error: `cannot access '${path}': ${
        err instanceof Error ? err.message : String(err)
      }`,
      exitCode: 3,
    };
  }

  return null;
}

/**
 * パースされた CLI 引数のバリデーションを行う。
 */
export async function validateCliArgs(
  parsed: ParsedCliArgs,
): Promise<ValidationResult> {
  // --help または --version、各種単独実行フラグ指定時はバリデーションをスキップ
  if (
    parsed.help ||
    parsed.version ||
    parsed.installContextMenu ||
    parsed.uninstallContextMenu ||
    parsed.generateContextMenuScript ||
    parsed.clearHistory
  ) {
    return { ok: true };
  }

  const { positional, left, right, base } = parsed;

  // 位置引数なし → Welcome モード
  if (positional.length === 0) {
    parsed.mode = "welcome";
    return { ok: true };
  }

  if (positional.length === 1 && positional[0] !== "-") {
    const singlePath = positional[0];
    try {
      const stat = await Deno.stat(singlePath);
      if (!stat.isDirectory) {
        const content = await Deno.readTextFile(singlePath);
        const { hasConflictMarkers } = await import(
          "../core/conflict_parser.ts"
        );
        if (hasConflictMarkers(content)) {
          parsed.mode = "3way";
          parsed.left = singlePath;
          if (!parsed.output) {
            parsed.output = singlePath;
          }
          return { ok: true };
        }
      }
    } catch {
      // ファイルが存在しない等のエラーも引数不足エラーとする
    }

    return {
      ok: false,
      error:
        "insufficient positional arguments (2 or 3 required, or a file containing Git conflict markers)",
      exitCode: 2,
      showUsage: true,
    };
  }

  if (positional.length === 7 && parsed.mode === "git-external") {
    // git diff.external 形式のチェック
    if (left) {
      const err = await checkFilePath(left);
      if (err) return err;
    }
    if (right) {
      const err = await checkFilePath(right);
      if (err) return err;
    }
    return { ok: true };
  }

  if (positional.length > 3) {
    return {
      ok: false,
      error: "too many positional arguments (max 3 allowed)",
      exitCode: 2,
      showUsage: true,
    };
  }

  // 2-Way の場合: ディレクトリ比較かファイル比較かを判定
  if (positional.length === 2 && left && right) {
    try {
      const leftStat = await Deno.stat(left);
      const rightStat = await Deno.stat(right);

      if (leftStat.isDirectory && rightStat.isDirectory) {
        parsed.mode = "directory";
        return { ok: true };
      }

      if (leftStat.isDirectory !== rightStat.isDirectory) {
        return {
          ok: false,
          error: "cannot compare a file with a directory",
          exitCode: 3,
        };
      }
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        // どちらが存在しないか確認してわかりやすいエラーを返す
        const leftErr = await checkFilePath(left);
        if (leftErr) return leftErr;
        const rightErr = await checkFilePath(right);
        if (rightErr) return rightErr;
      }
      return {
        ok: false,
        error: `cannot access path: ${
          err instanceof Error ? err.message : String(err)
        }`,
        exitCode: 3,
      };
    }
  }

  // ファイルアクセスチェック (2-Way ファイル比較 / 3-Way)
  if (left) {
    const err = await checkFilePath(left);
    if (err) return err;
  }

  if (right) {
    const err = await checkFilePath(right);
    if (err) return err;
  }

  if (base) {
    const err = await checkFilePath(base);
    if (err) return err;
  }

  return { ok: true };
}
