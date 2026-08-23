/**
 * ファイル・ディレクトリの無視ルール（.gitignore / デフォルト除外）（B1-02）。
 */

import { join, normalize } from "@std/path";

/** デフォルトで除外するディレクトリ・ファイルパターン */
export const DEFAULT_IGNORE_PATTERNS = [
  ".git",
  ".git/**",
  "node_modules",
  "node_modules/**",
  "dist",
  "dist/**",
  ".DS_Store",
  "Thumbs.db",
  ".deno",
  ".deno/**",
];

export interface IgnoreRule {
  pattern: string;
  negated: boolean;
  dirOnly: boolean;
  regex: RegExp;
}

/**
 * gitignore パターンを正規表現に変換する。
 */
export function patternToRegex(
  pattern: string,
): { regex: RegExp; dirOnly: boolean } {
  let p = pattern.trim().replace(/\\/g, "/");
  let dirOnly = false;
  if (p.endsWith("/")) {
    dirOnly = true;
    p = p.slice(0, -1);
  }

  // 先頭スラッシュはルート相対
  const isRoot = p.startsWith("/");
  if (isRoot) {
    p = p.slice(1);
  }

  // ワイルドカード変換
  let reStr = "";
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === "*" && p[i + 1] === "*") {
      if (p[i + 2] === "/") {
        reStr += "(?:.*/)?";
        i += 3;
        continue;
      } else {
        reStr += ".*";
        i += 2;
        continue;
      }
    } else if (c === "*") {
      reStr += "[^/]*";
    } else if (c === "?") {
      reStr += "[^/]";
    } else if (
      c === "." || c === "+" || c === "^" || c === "$" || c === "{" ||
      c === "}" || c === "(" || c === ")" || c === "[" || c === "]" ||
      c === "|" || c === "\\"
    ) {
      reStr += "\\" + c;
    } else {
      reStr += c;
    }
    i++;
  }

  if (isRoot) {
    reStr = "^" + reStr + (dirOnly ? "(?:/.*)?$" : "(?:/.*)?$");
  } else {
    reStr = "(?:^|/)" + reStr + (dirOnly ? "(?:/.*)?$" : "(?:/.*)?$");
  }

  return { regex: new RegExp(reStr), dirOnly };
}

/**
 * 単一の無視ルールをパースする。
 */
export function parseIgnoreRule(line: string): IgnoreRule | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const negated = trimmed.startsWith("!");
  const rawPattern = negated ? trimmed.slice(1) : trimmed;
  const { regex, dirOnly } = patternToRegex(rawPattern);

  return {
    pattern: rawPattern,
    negated,
    dirOnly,
    regex,
  };
}

/**
 * 複数行の gitignore テキストからルール一覧を作成する。
 */
export function parseIgnoreLines(content: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const line of content.split(/\r?\n/)) {
    const rule = parseIgnoreRule(line);
    if (rule) {
      rules.push(rule);
    }
  }
  return rules;
}

/**
 * ディレクトリ内の .gitignore を探索してルール一覧を構築する。
 */
export async function loadIgnoreRules(dirPath: string): Promise<IgnoreRule[]> {
  const rules: IgnoreRule[] = [];

  // デフォルトルールの追加
  for (const pat of DEFAULT_IGNORE_PATTERNS) {
    const rule = parseIgnoreRule(pat);
    if (rule) rules.push(rule);
  }

  // .gitignore の読み込み
  const gitignorePath = join(dirPath, ".gitignore");
  try {
    const content = await Deno.readTextFile(gitignorePath);
    rules.push(...parseIgnoreLines(content));
  } catch {
    // .gitignore が存在しない場合は無視
  }

  return rules;
}

/**
 * パスが無視対象かどうかを判定する。
 */
export function isPathIgnored(
  relativePath: string,
  isDir: boolean,
  rules: IgnoreRule[],
): boolean {
  const normalized = normalize(relativePath).replace(/\\/g, "/").replace(
    /^\.\//,
    "",
  );
  if (!normalized || normalized === ".") return false;

  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir && !normalized.includes("/")) {
      continue;
    }
    if (rule.regex.test(normalized)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}
