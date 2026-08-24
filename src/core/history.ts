/**
 * 比較履歴管理 & 自動セッション保存・復元（B6-03）。
 *
 * 比較履歴（~/.diffrex/history.json）および直近セッションスナップショット（~/.diffrex/last_session.json）を管理する。
 */

import { join } from "@std/path";
import type { HistoryEntry, SessionSnapshot } from "./types.ts";

const MAX_HISTORY_ITEMS = 50;

/**
 * Diffrex のユーザー設定ディレクトリを取得する（例: ~/.diffrex）。
 */
export function getConfigDir(): string {
  const home = Deno.env.get("USERPROFILE") || Deno.env.get("HOME") || ".";
  return join(home, ".diffrex");
}

export function getHistoryFilePath(): string {
  return join(getConfigDir(), "history.json");
}

export function getSnapshotFilePath(): string {
  return join(getConfigDir(), "last_session.json");
}

/**
 * 比較履歴リストを読み込む。
 */
export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const path = getHistoryFilePath();
    const content = await Deno.readTextFile(path);
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return data as HistoryEntry[];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * 比較履歴リストを保存する。
 */
export async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  try {
    const configDir = getConfigDir();
    await Deno.mkdir(configDir, { recursive: true });
    const path = getHistoryFilePath();
    const limited = entries.slice(0, MAX_HISTORY_ITEMS);
    await Deno.writeTextFile(path, JSON.stringify(limited, null, 2));
  } catch (err) {
    console.error("Failed to save diffrex history:", err);
  }
}

/**
 * 新しい比較履歴を先頭に記録する。
 */
export async function recordHistoryEntry(
  entry: Omit<HistoryEntry, "id" | "timestamp">,
): Promise<HistoryEntry> {
  const current = await loadHistory();

  // 同一パスの比較が既に存在する場合は更新
  const filtered = current.filter(
    (e) =>
      !(
        e.mode === entry.mode &&
        e.leftPath === entry.leftPath &&
        e.rightPath === entry.rightPath &&
        e.basePath === entry.basePath
      ),
  );

  const newEntry: HistoryEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };

  filtered.unshift(newEntry);
  await saveHistory(filtered);
  return newEntry;
}

/**
 * 指定 ID の履歴エントリーを削除する。
 */
export async function removeHistoryEntry(id: string): Promise<HistoryEntry[]> {
  const current = await loadHistory();
  const updated = current.filter((e) => e.id !== id);
  await saveHistory(updated);
  return updated;
}

/**
 * 全履歴を消去する。
 */
export async function clearHistory(): Promise<void> {
  try {
    const path = getHistoryFilePath();
    await Deno.remove(path);
  } catch {
    // ignore if doesn't exist
  }
}

/**
 * セッションスナップショットを保存する。
 */
export async function saveSessionSnapshot(
  snapshot: SessionSnapshot,
): Promise<void> {
  try {
    const configDir = getConfigDir();
    await Deno.mkdir(configDir, { recursive: true });
    const path = getSnapshotFilePath();
    await Deno.writeTextFile(path, JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.error("Failed to save session snapshot:", err);
  }
}

/**
 * 前回のセッションスナップショットを読み込む。
 */
export async function loadSessionSnapshot(): Promise<SessionSnapshot | null> {
  try {
    const path = getSnapshotFilePath();
    const content = await Deno.readTextFile(path);
    const data = JSON.parse(content) as SessionSnapshot;
    if (data && data.leftPath && data.rightPath) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * セッションスナップショットを削除する。
 */
export async function clearSessionSnapshot(): Promise<void> {
  try {
    const path = getSnapshotFilePath();
    await Deno.remove(path);
  } catch {
    // ignore
  }
}
