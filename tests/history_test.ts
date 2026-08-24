import { assertEquals, assertExists } from "@std/assert";
import {
  clearHistory,
  clearSessionSnapshot,
  loadHistory,
  loadSessionSnapshot,
  recordHistoryEntry,
  removeHistoryEntry,
  saveHistory,
  saveSessionSnapshot,
} from "../src/core/history.ts";

Deno.test("History: record, load, and deduplicate entries", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_hist_test_" });
  const origHome = Deno.env.get("HOME");
  const origProfile = Deno.env.get("USERPROFILE");

  try {
    Deno.env.set("HOME", tempDir);
    Deno.env.set("USERPROFILE", tempDir);

    // 初期状態は空
    const initial = await loadHistory();
    assertEquals(initial.length, 0);

    // 1件追加
    const entry1 = await recordHistoryEntry({
      mode: "2way",
      leftPath: "a.ts",
      rightPath: "b.ts",
      readOnly: false,
    });
    assertExists(entry1.id);
    assertExists(entry1.timestamp);

    let list = await loadHistory();
    assertEquals(list.length, 1);
    assertEquals(list[0].leftPath, "a.ts");
    assertEquals(list[0].rightPath, "b.ts");

    // 2件目追加
    await recordHistoryEntry({
      mode: "directory",
      leftPath: "dir1",
      rightPath: "dir2",
    });
    list = await loadHistory();
    assertEquals(list.length, 2);
    assertEquals(list[0].leftPath, "dir1"); // 先頭に追加される

    // 同一パスの比較を追加（重複除外・更新）
    await recordHistoryEntry({
      mode: "2way",
      leftPath: "a.ts",
      rightPath: "b.ts",
    });
    list = await loadHistory();
    assertEquals(list.length, 2);
    assertEquals(list[0].leftPath, "a.ts"); // 先頭に移動

    // 1件削除
    const updated = await removeHistoryEntry(list[0].id);
    assertEquals(updated.length, 1);
    assertEquals(updated[0].leftPath, "dir1");

    // 全クリア
    await clearHistory();
    const cleared = await loadHistory();
    assertEquals(cleared.length, 0);
  } finally {
    if (origHome) Deno.env.set("HOME", origHome);
    if (origProfile) Deno.env.set("USERPROFILE", origProfile);
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  }
});

Deno.test("History: 50 items maximum limit", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_hist_limit_" });
  const origHome = Deno.env.get("HOME");
  const origProfile = Deno.env.get("USERPROFILE");

  try {
    Deno.env.set("HOME", tempDir);
    Deno.env.set("USERPROFILE", tempDir);

    const items = [];
    for (let i = 0; i < 60; i++) {
      items.push({
        id: `id-${i}`,
        timestamp: new Date().toISOString(),
        mode: "2way" as const,
        leftPath: `file_${i}_left.ts`,
        rightPath: `file_${i}_right.ts`,
      });
    }

    await saveHistory(items);
    const loaded = await loadHistory();
    assertEquals(loaded.length, 50);
  } finally {
    if (origHome) Deno.env.set("HOME", origHome);
    if (origProfile) Deno.env.set("USERPROFILE", origProfile);
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  }
});

Deno.test("Session Snapshot: save, load, and clear", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_snap_test_" });
  const origHome = Deno.env.get("HOME");
  const origProfile = Deno.env.get("USERPROFILE");

  try {
    Deno.env.set("HOME", tempDir);
    Deno.env.set("USERPROFILE", tempDir);

    // 初期状態
    const initSnap = await loadSessionSnapshot();
    assertEquals(initSnap, null);

    // スナップショット保存
    await saveSessionSnapshot({
      timestamp: new Date().toISOString(),
      mode: "2way",
      leftPath: "orig.ts",
      rightPath: "edit.ts",
      hunkStatuses: { hunk1: "accepted", hunk2: "rejected" },
      unsavedRightContent: "const modified = 1;",
    });

    const loaded = await loadSessionSnapshot();
    assertExists(loaded);
    assertEquals(loaded.mode, "2way");
    assertEquals(loaded.leftPath, "orig.ts");
    assertEquals(loaded.rightPath, "edit.ts");
    assertEquals(loaded.hunkStatuses?.hunk1, "accepted");
    assertEquals(loaded.unsavedRightContent, "const modified = 1;");

    // スナップショット削除
    await clearSessionSnapshot();
    const afterClear = await loadSessionSnapshot();
    assertEquals(afterClear, null);
  } finally {
    if (origHome) Deno.env.set("HOME", origHome);
    if (origProfile) Deno.env.set("USERPROFILE", origProfile);
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  }
});
