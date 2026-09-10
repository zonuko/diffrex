/**
 * ウィンドウサイズ & 位置の状態管理（B14-01）。
 *
 * デフォルト起動サイズ 1280x800、最小サイズ 800x600 のクランプ制御、
 * および前回起動時のウィンドウサイズ・位置の永続化と復元を提供する。
 */

import { join } from "@std/path";
import { getConfigDir } from "./history.ts";

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export const DEFAULT_WINDOW_WIDTH = 1280;
export const DEFAULT_WINDOW_HEIGHT = 800;
export const MIN_WINDOW_WIDTH = 800;
export const MIN_WINDOW_HEIGHT = 600;

export function getWindowStateFilePath(): string {
  return join(getConfigDir(), "window_state.json");
}

/**
 * 幅と高さを最小サイズ（800x600）以上にクランプする。
 */
export function clampWindowSize(
  width: number,
  height: number,
): { width: number; height: number } {
  return {
    width: Math.max(MIN_WINDOW_WIDTH, Math.round(width)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.round(height)),
  };
}

/**
 * 前回のウィンドウ状態を読み込む。存在しない・破損時はデフォルト値を返す。
 */
export async function loadWindowState(): Promise<WindowState> {
  try {
    const path = getWindowStateFilePath();
    const content = await Deno.readTextFile(path);
    const parsed = JSON.parse(content);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.width === "number" &&
      typeof parsed.height === "number"
    ) {
      const clamped = clampWindowSize(parsed.width, parsed.height);
      return {
        width: clamped.width,
        height: clamped.height,
        x: typeof parsed.x === "number" ? Math.round(parsed.x) : undefined,
        y: typeof parsed.y === "number" ? Math.round(parsed.y) : undefined,
      };
    }
  } catch {
    // ファイルが存在しない等の場合はデフォルトを返す
  }

  return {
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
  };
}

/**
 * 現在のウィンドウ状態を保存する。
 */
export async function saveWindowState(state: WindowState): Promise<void> {
  try {
    const configDir = getConfigDir();
    await Deno.mkdir(configDir, { recursive: true });
    const path = getWindowStateFilePath();
    const clamped = clampWindowSize(state.width, state.height);
    const data: WindowState = {
      width: clamped.width,
      height: clamped.height,
      x: typeof state.x === "number" ? Math.round(state.x) : undefined,
      y: typeof state.y === "number" ? Math.round(state.y) : undefined,
    };
    await Deno.writeTextFile(path, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to save diffrex window state:", err);
  }
}
