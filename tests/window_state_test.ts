import { assertEquals } from "@std/assert";
import {
  clampWindowSize,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  getWindowStateFilePath,
  loadWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  saveWindowState,
} from "../src/core/window_state.ts";

Deno.test("clampWindowSize - normal size retains values", () => {
  const clamped = clampWindowSize(1920, 1080);
  assertEquals(clamped.width, 1920);
  assertEquals(clamped.height, 1080);
});

Deno.test("clampWindowSize - below minimum is clamped to MIN values", () => {
  const clamped = clampWindowSize(400, 300);
  assertEquals(clamped.width, MIN_WINDOW_WIDTH);
  assertEquals(clamped.height, MIN_WINDOW_HEIGHT);
});

Deno.test("clampWindowSize - rounds floating point values", () => {
  const clamped = clampWindowSize(1279.8, 799.4);
  assertEquals(clamped.width, 1280);
  assertEquals(clamped.height, 799);
});

Deno.test("constants - default and min sizes are valid", () => {
  assertEquals(DEFAULT_WINDOW_WIDTH, 1280);
  assertEquals(DEFAULT_WINDOW_HEIGHT, 800);
  assertEquals(MIN_WINDOW_WIDTH, 800);
  assertEquals(MIN_WINDOW_HEIGHT, 600);
});

Deno.test("saveWindowState & loadWindowState - roundtrip persistence", async () => {
  // 元のファイルを退避（もしあれば）
  const filePath = getWindowStateFilePath();
  let originalContent: string | null = null;
  try {
    originalContent = await Deno.readTextFile(filePath);
  } catch {
    // ignore
  }

  try {
    // 保存
    await saveWindowState({
      width: 1440,
      height: 900,
      x: 100,
      y: 50,
    });

    // 読み込み
    const loaded = await loadWindowState();
    assertEquals(loaded.width, 1440);
    assertEquals(loaded.height, 900);
    assertEquals(loaded.x, 100);
    assertEquals(loaded.y, 50);

    // 最小サイズ未満で保存してもロード時にクランプされる
    await saveWindowState({
      width: 500,
      height: 400,
    });
    const clampedLoaded = await loadWindowState();
    assertEquals(clampedLoaded.width, MIN_WINDOW_WIDTH);
    assertEquals(clampedLoaded.height, MIN_WINDOW_HEIGHT);
  } finally {
    // 復元または削除
    if (originalContent !== null) {
      await Deno.writeTextFile(filePath, originalContent);
    } else {
      try {
        await Deno.remove(filePath);
      } catch {
        // ignore
      }
    }
  }
});
