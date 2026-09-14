/**
 * サブディレクトリ内 Git リポジトリ（.git）探索 & サブモジュール解析（B13-01, B13-05）。
 */

import { basename, join, normalize, relative } from "@std/path";
import { getCurrentBranch, isGitRepository } from "./worktree.ts";
import { runGitCommand } from "./exec.ts";

export interface SubGitRepoInfo {
  /** 親ルートディレクトリからの相対パス（例: ""（ルート直下）, "packages/app"）。スラッシュ区切り */
  relativePath: string;
  /** リポジトリの絶対パス */
  absolutePath: string;
  /** リポジトリの表示名（例: "app", "(root)"） */
  name: string;
  /** サブモジュールかどうか */
  isSubmodule?: boolean;
  /** 現在のブランチ名 */
  branch?: string;
  /** HEAD コミットハッシュ（短縮） */
  headCommit?: string;
  /** サブモジュール URL（.gitmodules から取得した場合） */
  submoduleUrl?: string;
}

export interface GitSubmoduleConfig {
  name: string;
  path: string;
  url: string;
  branch?: string;
}

/**
 * スキップすべき一般的な巨大・依存ディレクトリ名
 */
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  ".deno",
  ".cache",
  "target",
  "dist",
  "build",
  ".turbo",
  ".next",
  ".nuxt",
  ".venv",
  "venv",
  "vendor",
  "bower_components",
  "out",
  "coverage",
]);

/**
 * `.gitmodules` ファイルの内容をパースしてサブモジュール定義一覧を返す。
 */
export function parseGitModules(content: string): GitSubmoduleConfig[] {
  const submodules: GitSubmoduleConfig[] = [];
  const lines = content.split(/\r?\n/);

  let currentSubmodule: Partial<GitSubmoduleConfig> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }

    const headerMatch = trimmed.match(/^\[submodule\s+"(.+)"\]$/i);
    if (headerMatch) {
      if (currentSubmodule && currentSubmodule.path && currentSubmodule.url) {
        submodules.push(currentSubmodule as GitSubmoduleConfig);
      }
      currentSubmodule = { name: headerMatch[1].trim() };
      continue;
    }

    if (!currentSubmodule) continue;

    const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim().toLowerCase();
      const val = kvMatch[2].trim();
      if (key === "path") {
        currentSubmodule.path = normalize(val).replace(/\\/g, "/");
      } else if (key === "url") {
        currentSubmodule.url = val;
      } else if (key === "branch") {
        currentSubmodule.branch = val;
      }
    }
  }

  if (currentSubmodule && currentSubmodule.path && currentSubmodule.url) {
    submodules.push(currentSubmodule as GitSubmoduleConfig);
  }

  return submodules;
}

/**
 * 指定ディレクトリ内の `.gitmodules` を読み取り、存在すればサブモジュール一覧を返す。
 */
export async function loadSubmoduleConfigs(
  dirPath: string,
): Promise<GitSubmoduleConfig[]> {
  try {
    const gitmodulesPath = join(dirPath, ".gitmodules");
    const content = await Deno.readTextFile(gitmodulesPath);
    return parseGitModules(content);
  } catch {
    return [];
  }
}

/**
 * 指定リポジトリの HEAD コミットハッシュ（短縮7桁）を取得する。
 */
export async function getHeadCommit(
  repoPath: string,
): Promise<string | undefined> {
  const res = await runGitCommand(["rev-parse", "--short", "HEAD"], repoPath);
  if (res.code === 0 && res.stdout.trim()) {
    return res.stdout.trim();
  }
  return undefined;
}

/**
 * 指定ディレクトリ配下の Git リポジトリを再帰的に走査・検出する（B13-01）。
 * ルート自身が Git リポジトリである場合もリストの先頭に含める。
 */
export async function findSubGitRepositories(
  baseDir: string,
  options: {
    maxDepth?: number;
    ignoreDirs?: Set<string>;
  } = {},
): Promise<SubGitRepoInfo[]> {
  const normBase = normalize(baseDir);
  const maxDepth = options.maxDepth ?? 4;
  const ignoreSet = options.ignoreDirs ?? IGNORED_DIRECTORY_NAMES;
  const results: SubGitRepoInfo[] = [];

  // 親ディレクトリの .gitmodules を読み取り
  const rootSubmodules = await loadSubmoduleConfigs(normBase);
  const submoduleMap = new Map<string, GitSubmoduleConfig>();
  for (const sm of rootSubmodules) {
    submoduleMap.set(sm.path, sm);
  }

  // ルート自身が Git リポジトリかチェック
  if (await isGitRepository(normBase)) {
    const branch = await getCurrentBranch(normBase);
    const headCommit = await getHeadCommit(normBase);
    results.push({
      relativePath: "",
      absolutePath: normBase,
      name: basename(normBase) || "(root)",
      branch: branch ?? undefined,
      headCommit,
      isSubmodule: false,
    });
  }

  // 再帰スキャン関数
  async function scan(currentDir: string, currentDepth: number): Promise<void> {
    if (currentDepth > maxDepth) return;

    let entries: Deno.DirEntry[];
    try {
      entries = [];
      for await (const entry of Deno.readDir(currentDir)) {
        entries.push(entry);
      }
    } catch {
      return;
    }

    // ディレクトリのみソートして走査
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      if (ignoreSet.has(entry.name)) continue;

      const subDir = join(currentDir, entry.name);
      const relPath = normalize(relative(normBase, subDir)).replace(/\\/g, "/");

      // このサブディレクトリが Git リポジトリ（.git ディレクトリまたは .git ファイル）か判定
      const isRepo = await isGitRepository(subDir);
      if (isRepo) {
        // サブモジュール判定: .gitmodules の登録パスと一致、または .git がファイル
        const smConfig = submoduleMap.get(relPath);
        let isSubmodule = Boolean(smConfig);
        if (!isSubmodule) {
          try {
            const stat = await Deno.stat(join(subDir, ".git"));
            if (stat.isFile) {
              isSubmodule = true;
            }
          } catch {
            // ignore
          }
        }

        const [branch, headCommit] = await Promise.all([
          getCurrentBranch(subDir),
          getHeadCommit(subDir),
        ]);

        results.push({
          relativePath: relPath,
          absolutePath: subDir,
          name: entry.name,
          isSubmodule,
          branch: branch ?? undefined,
          headCommit,
          submoduleUrl: smConfig?.url,
        });

        // サブリポジトリ内にもさらに .gitmodules があるか確認してマップに追加
        const innerSubmodules = await loadSubmoduleConfigs(subDir);
        for (const innerSm of innerSubmodules) {
          const fullSmRel = `${relPath}/${innerSm.path}`;
          submoduleMap.set(fullSmRel, innerSm);
        }
      }

      // サブリポジトリであっても、さらに深い階層にネストされたリポジトリ（サブモジュール等）がある可能性があるため探索継続
      await scan(subDir, currentDepth + 1);
    }
  }

  await scan(normBase, 1);
  return results;
}
