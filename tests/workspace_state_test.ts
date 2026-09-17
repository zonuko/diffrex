/**
 * ワークスペース状態の自動永続化 & セッション自動復帰テスト（B-17 / B17-07）。
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  clearWorkspaceState,
  isRestoreEligible,
  loadWorkspaceState,
  saveWorkspaceState,
  validateAndFilterWorkspaceState,
} from "../src/core/workspace_state.ts";
import type { WorkspaceState } from "../src/core/types.ts";
import { parseCliArgs } from "../src/cli/args.ts";
import { TabContainerModel } from "../src/ui/model/tab_model.ts";
import { TabController } from "../src/ui/controller/tab_controller.ts";
import { DiffSessionModel } from "../src/ui/model/diff_session_model.ts";

Deno.test("WorkspaceState: 保存・読込・クリアのラウンドトリップ検証", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_ws_test_" });
  const testPath = join(tempDir, "workspace_state.json");

  try {
    const initialState = await loadWorkspaceState(testPath);
    assertEquals(initialState, null);

    const testState: WorkspaceState = {
      version: 1,
      timestamp: new Date().toISOString(),
      restoreOnStartup: true,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "sample1.txt ↔ sample2.txt",
          sessionType: "2way",
          leftPath: "/path/to/sample1.txt",
          rightPath: "/path/to/sample2.txt",
          readOnly: false,
          prompt: "テストプロンプト",
        },
        {
          id: "tab-2",
          title: "dirA (Dir)",
          sessionType: "directory",
          baseDir: "/path/to/dirA",
          targetDir: "/path/to/dirB",
          selectedPath: "sub/file.ts",
          expandedPaths: ["sub"],
        },
      ],
    };

    await saveWorkspaceState(testState, testPath);

    const loaded = await loadWorkspaceState(testPath);
    assertEquals(loaded?.version, 1);
    assertEquals(loaded?.restoreOnStartup, true);
    assertEquals(loaded?.activeTabId, "tab-1");
    assertEquals(loaded?.tabs.length, 2);
    assertEquals(loaded?.tabs[0].title, "sample1.txt ↔ sample2.txt");
    assertEquals(loaded?.tabs[1].selectedPath, "sub/file.ts");

    await clearWorkspaceState(testPath);
    const afterClear = await loadWorkspaceState(testPath);
    assertEquals(afterClear, null);
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("WorkspaceState: セーフガード - 存在しないファイルや一時ファイルのスキップ (B17-05)", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_ws_sg_" });
  const fileA = join(tempDir, "a.txt");
  const fileB = join(tempDir, "b.txt");
  await Deno.writeTextFile(fileA, "content A");
  await Deno.writeTextFile(fileB, "content B");

  try {
    const state: WorkspaceState = {
      version: 1,
      timestamp: new Date().toISOString(),
      restoreOnStartup: true,
      activeTabId: "tab-missing",
      tabs: [
        {
          id: "tab-missing",
          title: "missing.txt ↔ non_existent.txt",
          sessionType: "2way",
          leftPath: join(tempDir, "missing1.txt"),
          rightPath: join(tempDir, "missing2.txt"),
        },
        {
          id: "tab-valid",
          title: "a.txt ↔ b.txt",
          sessionType: "2way",
          leftPath: fileA,
          rightPath: fileB,
        },
        {
          id: "tab-stdin",
          title: "stdin",
          sessionType: "2way",
          leftPath: "<stdin>",
          rightPath: fileB,
        },
        {
          id: "tab-welcome",
          title: "Welcome",
          sessionType: "welcome",
        },
      ],
    };

    const filtered = await validateAndFilterWorkspaceState(state);

    // missing と stdin は除外され、valid と welcome が残る
    assertEquals(filtered.tabs.length, 2);
    assertEquals(filtered.tabs[0].id, "tab-valid");
    assertEquals(filtered.tabs[1].id, "tab-welcome");
    // 元のアクティブタブが無効だったため、残った先頭の tab-valid に自動調整される
    assertEquals(filtered.activeTabId, "tab-valid");
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("WorkspaceState: isRestoreEligible 判定ロジック", () => {
  // null
  assertEquals(isRestoreEligible(null), false);

  // restoreOnStartup: false
  assertEquals(
    isRestoreEligible({
      version: 1,
      timestamp: "",
      restoreOnStartup: false,
      activeTabId: null,
      tabs: [{
        id: "1",
        title: "t",
        sessionType: "2way",
        leftPath: "a",
        rightPath: "b",
      }],
    }),
    false,
  );

  // tabs が空
  assertEquals(
    isRestoreEligible({
      version: 1,
      timestamp: "",
      restoreOnStartup: true,
      activeTabId: null,
      tabs: [],
    }),
    false,
  );

  // welcome タブのみ
  assertEquals(
    isRestoreEligible({
      version: 1,
      timestamp: "",
      restoreOnStartup: true,
      activeTabId: "w",
      tabs: [{ id: "w", title: "Welcome", sessionType: "welcome" }],
    }),
    false,
  );

  // 有効な 2way タブあり
  assertEquals(
    isRestoreEligible({
      version: 1,
      timestamp: "",
      restoreOnStartup: true,
      activeTabId: "1",
      tabs: [{
        id: "1",
        title: "t",
        sessionType: "2way",
        leftPath: "a",
        rightPath: "b",
      }],
    }),
    true,
  );
});

Deno.test("CLI Args: --no-restore および --welcome フラグのパース (B17-04)", () => {
  const res1 = parseCliArgs(["--no-restore"]);
  assertEquals(res1.ok, true);
  if (res1.ok) {
    assertEquals(res1.parsed.noRestore, true);
    assertEquals(res1.parsed.mode, "welcome");
  }

  const res2 = parseCliArgs(["--welcome"]);
  assertEquals(res2.ok, true);
  if (res2.ok) {
    assertEquals(res2.parsed.welcome, true);
    assertEquals(res2.parsed.mode, "welcome");
  }

  const res3 = parseCliArgs(["fileA", "fileB", "--no-restore"]);
  assertEquals(res3.ok, true);
  if (res3.ok) {
    assertEquals(res3.parsed.noRestore, true);
    assertEquals(res3.parsed.mode, "2way");
  }
});

Deno.test("TabController: snapshotWorkspace でマルチタブ状態をスナップショット化できる", () => {
  const model = new TabContainerModel();
  const controller = new TabController(model);

  const diffModel = new DiffSessionModel({
    sessionId: "test-sess",
    timestamp: new Date().toISOString(),
    mode: "2way",
    files: {
      left: { path: "left.ts", content: "const a = 1;", readOnly: true },
      right: { path: "right.ts", content: "const a = 2;", readOnly: false },
    },
    hunks: [
      {
        id: "hunk-1",
        lineStartLeft: 1,
        lineEndLeft: 1,
        lineStartRight: 1,
        lineEndRight: 1,
        isNoise: false,
        riskLevel: "normal",
        status: "accepted",
      },
    ],
    options: { ignoreSpace: false, ignoreComments: false },
  });

  model.addTab({
    id: "tab-diff",
    title: "left.ts ↔ right.ts",
    sessionType: "2way",
    diffModel,
    isDirty: true,
    closable: true,
  });

  model.addTab({
    id: "welcome",
    title: "Welcome",
    sessionType: "welcome",
    isDirty: false,
    closable: true,
  });

  model.setActiveTab("tab-diff");

  const snapshot = controller.snapshotWorkspace(true);
  assertEquals(snapshot.version, 1);
  assertEquals(snapshot.restoreOnStartup, true);
  assertEquals(snapshot.activeTabId, "tab-diff");
  assertEquals(snapshot.tabs.length, 2);
  assertEquals(snapshot.tabs[0].id, "tab-diff");
  assertEquals(snapshot.tabs[0].leftPath, "left.ts");
  assertEquals(snapshot.tabs[0].rightPath, "right.ts");
  assertEquals(snapshot.tabs[0].hunkStatuses?.["hunk-1"], "accepted");
  assertEquals(snapshot.tabs[1].sessionType, "welcome");
});

Deno.test("runMain: 引数なし起動時の自動復元と --no-restore / --welcome (B17-04)", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_main_ws_" });
  const origHome = Deno.env.get("HOME");
  const origProfile = Deno.env.get("USERPROFILE");

  const fileA = join(tempDir, "sample_a.ts");
  const fileB = join(tempDir, "sample_b.ts");
  await Deno.writeTextFile(fileA, "export const a = 1;");
  await Deno.writeTextFile(fileB, "export const a = 2;");

  try {
    Deno.env.set("HOME", tempDir);
    Deno.env.set("USERPROFILE", tempDir);

    const { runMain } = await import("../main.ts");

    // 1. ワークスペース状態を保存
    await saveWorkspaceState({
      version: 1,
      timestamp: new Date().toISOString(),
      restoreOnStartup: true,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "sample_a.ts ↔ sample_b.ts",
          sessionType: "2way",
          leftPath: fileA,
          rightPath: fileB,
        },
      ],
    });

    // 2. 引数なし起動 -> 自動復元され正常終了
    const codeRestore = await runMain([], { autoClose: true });
    assertEquals(codeRestore, 0);

    // 3. --no-restore 起動 -> 自動復元をスキップして正常終了
    const codeNoRestore = await runMain(["--no-restore"], { autoClose: true });
    assertEquals(codeNoRestore, 0);

    // 4. --welcome 起動 -> 自動復元をスキップして Welcome 画面で正常終了
    const codeWelcome = await runMain(["--welcome"], { autoClose: true });
    assertEquals(codeWelcome, 0);
  } finally {
    if (origHome) Deno.env.set("HOME", origHome);
    if (origProfile) Deno.env.set("USERPROFILE", origProfile);
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});
