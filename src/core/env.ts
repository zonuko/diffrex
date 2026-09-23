/**
 * src/core/env.ts
 *
 * カレントディレクトリの .env ファイルを安全に読み込み、
 * 未設定の環境変数に自動反映する軽量ユーティリティ。
 */

export function loadEnvFile(envPath = ".env"): void {
  try {
    const content = Deno.readTextFileSync(envPath);
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();

      // クォートの除去 ("...", '...')
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      // 既存の環境変数が設定されていない場合のみセット
      try {
        if (!Deno.env.get(key)) {
          Deno.env.set(key, val);
        }
      } catch {
        // 環境変数操作の権限がない場合はスキップ
      }
    }
  } catch {
    // .env ファイルが存在しない場合は何もしない
  }
}

// モジュール読み込み時に自動で一度実行
loadEnvFile();
