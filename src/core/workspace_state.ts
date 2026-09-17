/**
 * ワークスペース状態の自動永続化 & セッション自動復帰（B-17）。
 *
 * マルチタブ・ディレクトリツリー状態のスナップショット（~/.diffrex/workspace_state.json）の
 * 原子的保存・読み込み、および存在しないファイルに対するセーフガードを提供する。
 */

import { dirname, join } from "@std/path";
import { getConfigDir } from "./history.ts";
import type { TabStateSnapshot, WorkspaceState } from "./types.ts";

export function getWorkspaceFilePath(): string {
  return join(getConfigDir(), "workspace_state.json");
}

/**
 * ワークスペース状態を原子的（同一ディレクトリ内一時ファイル + rename）に保存する。
 */
export async function saveWorkspaceState(
  state: WorkspaceState,
  customPath?: string,
): Promise<void> {
  const filePath = customPath ?? getWorkspaceFilePath();
  const targetDir = dirname(filePath);

  try {
    await Deno.mkdir(targetDir, { recursive: true });
    const content = JSON.stringify(state, null, 2);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(content);

    const tempFileName = `.Diffrex_tmp_ws_${crypto.randomUUID()}`;
    const tempPath = join(targetDir, tempFileName);

    await Deno.writeFile(tempPath, encoded);
    await Deno.rename(tempPath, filePath);
  } catch (err) {
    console.error("Failed to save workspace state:", err);
  }
}

/**
 * 保存されたワークスペース状態を読み込む。
 * ファイルが存在しないか破損している場合は null を返す。
 */
export async function loadWorkspaceState(
  customPath?: string,
): Promise<WorkspaceState | null> {
  try {
    const filePath = customPath ?? getWorkspaceFilePath();
    const content = await Deno.readTextFile(filePath);
    const data = JSON.parse(content);
    if (
      data &&
      typeof data === "object" &&
      typeof data.version === "number" &&
      Array.isArray(data.tabs)
    ) {
      return data as WorkspaceState;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * ワークスペース状態ファイルを削除する。
 */
export async function clearWorkspaceState(
  customPath?: string,
): Promise<void> {
  try {
    const filePath = customPath ?? getWorkspaceFilePath();
    await Deno.remove(filePath);
  } catch {
    // ignore error if not exists
  }
}

/**
 * ファイルまたはディレクトリが存在するか確認する内部ヘルパー。
 */
async function pathExists(path?: string): Promise<boolean> {
  if (!path || path.trim().length === 0) return false;
  if (path === "<stdin>" || path.includes(".Diffrex_tmp")) return false;
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * ワークスペース状態内の各タブを検証し、削除・移動・一時ファイル等の無効なエントリをスキップする（B17-05）。
 */
export async function validateAndFilterWorkspaceState(
  state: WorkspaceState,
): Promise<WorkspaceState> {
  const validTabs: TabStateSnapshot[] = [];

  for (const tab of state.tabs) {
    if (tab.sessionType === "welcome") {
      validTabs.push(tab);
      continue;
    }

    if (
      tab.sessionType === "2way" ||
      tab.sessionType === "image" ||
      tab.sessionType === "csv"
    ) {
      const leftOk = await pathExists(tab.leftPath);
      const rightOk = await pathExists(tab.rightPath);
      if (leftOk && rightOk) {
        validTabs.push(tab);
      } else {
        console.warn(
          `Diffrex: skipping missing tab '${tab.title}' (${
            tab.leftPath ?? ""
          } ⇄ ${tab.rightPath ?? ""})`,
        );
      }
      continue;
    }

    if (tab.sessionType === "3way") {
      const localOk = await pathExists(tab.leftPath);
      const baseOk = await pathExists(tab.basePath);
      const remoteOk = await pathExists(tab.rightPath);
      if (localOk && baseOk && remoteOk) {
        validTabs.push(tab);
      } else {
        console.warn(
          `Diffrex: skipping missing 3-way tab '${tab.title}' (${
            tab.leftPath ?? ""
          } / ${tab.basePath ?? ""} / ${tab.rightPath ?? ""})`,
        );
      }
      continue;
    }

    if (tab.sessionType === "directory") {
      const baseOk = await pathExists(tab.baseDir);
      const targetOk = await pathExists(tab.targetDir);
      if (baseOk && targetOk) {
        validTabs.push(tab);
      } else {
        console.warn(
          `Diffrex: skipping missing directory tab '${tab.title}' (${
            tab.baseDir ?? ""
          } ⇄ ${tab.targetDir ?? ""})`,
        );
      }
      continue;
    }

    // 未知のセッションタイプは安全にスキップ
  }

  let activeTabId = state.activeTabId;
  if (activeTabId && !validTabs.some((t) => t.id === activeTabId)) {
    activeTabId = validTabs.length > 0 ? validTabs[0].id : null;
  }

  return {
    ...state,
    tabs: validTabs,
    activeTabId,
  };
}

/**
 * ワークスペースが引数なし起動時に自動復元可能かどうかを判定する。
 */
export function isRestoreEligible(state: WorkspaceState | null): boolean {
  if (!state) return false;
  if (state.restoreOnStartup === false) return false;
  if (!Array.isArray(state.tabs) || state.tabs.length === 0) return false;
  // welcome のみのタブの場合は実質復元対象なしとみなす
  const nonWelcomeTabs = state.tabs.filter((t) => t.sessionType !== "welcome");
  return nonWelcomeTabs.length > 0;
}
