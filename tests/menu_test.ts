/**
 * MenuModel & MenuController テスト (B8-06)
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { MenuModel } from "../src/ui/model/menu_model.ts";
import { MenuController } from "../src/ui/controller/menu_controller.ts";
import { DiffSessionModel } from "../src/ui/model/diff_session_model.ts";
import { DiffController } from "../src/ui/controller/diff_controller.ts";
import { DirectoryDiffModel } from "../src/ui/model/dir_diff_model.ts";
import { DirectoryController } from "../src/ui/controller/dir_controller.ts";
import { ThreeWaySessionModel } from "../src/ui/model/three_way_session_model.ts";
import { ThreeWayController } from "../src/ui/controller/three_way_controller.ts";
import type { DiffSessionData } from "../src/core/types.ts";

function createMock2WaySession(): DiffSessionData {
  return {
    sessionId: "test-2way",
    timestamp: new Date().toISOString(),
    mode: "2way",
    files: {
      left: {
        path: "left.ts",
        content: "const a = 1;",
        readOnly: false,
      },
      right: {
        path: "right.ts",
        content: "const a = 2;",
        readOnly: false,
      },
    },
    hunks: [
      {
        id: "hunk-1",
        lineStartLeft: 1,
        lineEndLeft: 1,
        lineStartRight: 1,
        lineEndRight: 1,
        status: "unreviewed",
        isNoise: false,
        riskLevel: "normal",
      },
    ],
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
  };
}

function createMock3WaySession(): DiffSessionData {
  return {
    sessionId: "test-3way",
    timestamp: new Date().toISOString(),
    mode: "3way",
    files: {
      left: {
        path: "local.ts",
        content: "const a = 1;",
        readOnly: false,
      },
      base: {
        path: "base.ts",
        content: "const a = 0;",
        readOnly: false,
      },
      right: {
        path: "remote.ts",
        content: "const a = 2;",
        readOnly: false,
      },
    },
    hunks: [],
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
  };
}

Deno.test("MenuModel - 初期状態とカテゴリ操作・Observer 通知", () => {
  const model = new MenuModel();
  assertEquals(model.categories.length, 0);
  assertEquals(model.activeCategoryIndex, null);
  assertEquals(model.isShortcutsModalOpen, false);
  assertEquals(model.isAboutModalOpen, false);
  assertEquals(model.isCommandPaletteOpen, false);

  let notifiedCount = 0;
  model.subscribe(() => {
    notifiedCount++;
  });

  model.setCategories([
    { id: "cat1", label: "Cat 1", accessKey: "C", items: [] },
    { id: "cat2", label: "Cat 2", accessKey: "D", items: [] },
  ]);
  assertEquals(notifiedCount, 1);
  assertEquals(model.categories.length, 2);

  model.openCategory(1);
  assertEquals(model.activeCategoryIndex, 1);
  assertEquals(notifiedCount, 2);

  model.nextCategory();
  assertEquals(model.activeCategoryIndex, 0);
  assertEquals(notifiedCount, 3);

  model.prevCategory();
  assertEquals(model.activeCategoryIndex, 1);
  assertEquals(notifiedCount, 4);

  model.closeMenu();
  assertEquals(model.activeCategoryIndex, null);
  assertEquals(notifiedCount, 5);

  model.toggleCategory(0);
  assertEquals(model.activeCategoryIndex, 0);
  model.toggleCategory(0);
  assertEquals(model.activeCategoryIndex, null);
});

Deno.test("MenuModel - モーダルおよびコマンドパレットの排他的開閉", () => {
  const model = new MenuModel();
  model.openCategory(0);

  model.setShortcutsModalOpen(true);
  assertEquals(model.isShortcutsModalOpen, true);
  assertEquals(model.activeCategoryIndex, null); // メニューは自動で閉じる
  assertEquals(model.isAboutModalOpen, false);

  model.setAboutModalOpen(true);
  assertEquals(model.isAboutModalOpen, true);
  assertEquals(model.isShortcutsModalOpen, false);

  model.setCommandPaletteOpen(true);
  assertEquals(model.isCommandPaletteOpen, true);
  assertEquals(model.isAboutModalOpen, false);
  assertEquals(model.commandPaletteQuery, "");
  assertEquals(model.commandPaletteSelectedIndex, 0);

  model.setCommandPaletteQuery("マージ");
  assertEquals(model.commandPaletteQuery, "マージ");

  model.setCommandPaletteSelectedIndex(2);
  assertEquals(model.commandPaletteSelectedIndex, 2);
});

Deno.test("MenuController - 初期カテゴリ構成とショートカットの割り当て", () => {
  const menuModel = new MenuModel();
  const diffModel = new DiffSessionModel();
  const diffController = new DiffController(diffModel);
  const dirModel = new DirectoryDiffModel();
  const dirController = new DirectoryController(
    dirModel,
    diffModel,
    diffController,
  );

  const _controller = new MenuController(
    menuModel,
    diffModel,
    diffController,
    dirModel,
    dirController,
  );

  const categories = menuModel.categories;
  assertEquals(categories.length, 6);
  assertEquals(categories.map((c) => c.id), [
    "file",
    "edit",
    "merge",
    "view",
    "git",
    "help",
  ]);
  assertEquals(categories.map((c) => c.accessKey), [
    "F",
    "E",
    "M",
    "V",
    "G",
    "H",
  ]);

  // 初期（セッションなし Welcome 状態）では、編集・マージ操作は disabled
  const mergeCat = categories.find((c) => c.id === "merge");
  assertNotEquals(mergeCat, undefined);
  const nextHunk = mergeCat!.items.find((i) => i.id === "merge:next_hunk");
  assertEquals(nextHunk?.disabled, true);
});

Deno.test("MenuController - 2-Way テキストセッションでのメニュー項目活性化", () => {
  const menuModel = new MenuModel();
  const diffModel = new DiffSessionModel();
  const diffController = new DiffController(diffModel);
  const dirModel = new DirectoryDiffModel();
  const dirController = new DirectoryController(
    dirModel,
    diffModel,
    diffController,
  );

  const controller = new MenuController(
    menuModel,
    diffModel,
    diffController,
    dirModel,
    dirController,
  );

  // 2-Way セッションを設定
  diffModel.setSession(createMock2WaySession());
  controller.rebuildMenu();

  const fileCat = menuModel.categories.find((c) => c.id === "file")!;
  const saveItem = fileCat.items.find((i) => i.id === "file:save")!;
  assertEquals(saveItem.disabled, false);

  const mergeCat = menuModel.categories.find((c) => c.id === "merge")!;
  const nextHunk = mergeCat.items.find((i) => i.id === "merge:next_hunk")!;
  assertEquals(nextHunk.disabled, false);

  const acceptItem = mergeCat.items.find((i) => i.id === "merge:accept")!;
  assertEquals(acceptItem.disabled, false);
});

Deno.test("MenuController - 3-Way セッションでの 3-Way 固有マージ項目", () => {
  const menuModel = new MenuModel();
  const diffModel = new DiffSessionModel();
  const diffController = new DiffController(diffModel);
  const dirModel = new DirectoryDiffModel();
  const dirController = new DirectoryController(
    dirModel,
    diffModel,
    diffController,
  );
  const threeWayModel = new ThreeWaySessionModel();
  const threeWayController = new ThreeWayController(threeWayModel, {
    sendMessage: () => {},
  });

  const controller = new MenuController(
    menuModel,
    diffModel,
    diffController,
    dirModel,
    dirController,
    threeWayModel,
    threeWayController,
  );

  diffModel.setSession(createMock3WaySession());
  threeWayModel.setSession(diffModel.session!);
  controller.rebuildMenu();

  const mergeCat = menuModel.categories.find((c) => c.id === "merge")!;
  const baseItem = mergeCat.items.find((i) => i.id === "merge:3way_base");
  const leftItem = mergeCat.items.find((i) => i.id === "merge:3way_left");
  const rightItem = mergeCat.items.find((i) => i.id === "merge:3way_right");

  assertNotEquals(baseItem, undefined);
  assertNotEquals(leftItem, undefined);
  assertNotEquals(rightItem, undefined);
  assertEquals(baseItem?.shortcut, "Alt+B");
});

Deno.test("MenuController - コマンドパレットのコマンド抽出と絞り込み", () => {
  const menuModel = new MenuModel();
  const diffModel = new DiffSessionModel();
  const diffController = new DiffController(diffModel);
  const dirModel = new DirectoryDiffModel();
  const dirController = new DirectoryController(
    dirModel,
    diffModel,
    diffController,
  );

  diffModel.setSession(createMock2WaySession());

  const controller = new MenuController(
    menuModel,
    diffModel,
    diffController,
    dirModel,
    dirController,
  );

  const flatList = controller.getFlatCommandList();
  assertNotEquals(flatList.length, 0);

  // 「保存」で絞り込み
  const saveCommands = controller.filterCommands("保存");
  assertNotEquals(saveCommands.length, 0);
  assertEquals(saveCommands.some((c) => c.id === "file:save"), true);

  // 「マージ」で絞り込み
  const mergeCommands = controller.filterCommands("マージ");
  assertNotEquals(mergeCommands.length, 0);

  // 空文字で全有効コマンド取得
  const allEnabled = controller.filterCommands("");
  assertEquals(allEnabled.every((c) => !c.disabled), true);
});

function createMockKeyEvent(options: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): KeyboardEvent {
  return {
    key: options.key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as KeyboardEvent;
}

Deno.test("MenuController - キーボードナビゲーション (handleGlobalKeyDown)", () => {
  const menuModel = new MenuModel();
  const diffModel = new DiffSessionModel();
  const diffController = new DiffController(diffModel);
  const dirModel = new DirectoryDiffModel();
  const dirController = new DirectoryController(
    dirModel,
    diffModel,
    diffController,
  );

  const controller = new MenuController(
    menuModel,
    diffModel,
    diffController,
    dirModel,
    dirController,
  );

  // 1. Ctrl+Shift+P でパレット起動
  const paletteEvent = createMockKeyEvent({
    key: "P",
    ctrlKey: true,
    shiftKey: true,
  });
  const handledP = controller.handleGlobalKeyDown(paletteEvent);
  assertEquals(handledP, true);
  assertEquals(menuModel.isCommandPaletteOpen, true);

  // パレット中の Escape
  const escEvent = createMockKeyEvent({ key: "Escape" });
  const handledEsc = controller.handleGlobalKeyDown(escEvent);
  assertEquals(handledEsc, true);
  assertEquals(menuModel.isCommandPaletteOpen, false);

  // 2. Alt+F でファイルメニューを開く
  const altFEvent = createMockKeyEvent({ key: "f", altKey: true });
  const handledAltF = controller.handleGlobalKeyDown(altFEvent);
  assertEquals(handledAltF, true);
  assertEquals(menuModel.activeCategoryIndex, 0);

  // メニュー表示中の矢印右キーで隣のカテゴリへ
  const arrowRight = createMockKeyEvent({ key: "ArrowRight" });
  controller.handleGlobalKeyDown(arrowRight);
  assertEquals(menuModel.activeCategoryIndex, 1);

  // Escape でメニューを閉じる
  controller.handleGlobalKeyDown(escEvent);
  assertEquals(menuModel.activeCategoryIndex, null);

  // 3. F1 でショートカットモーダル
  const f1Event = createMockKeyEvent({ key: "F1" });
  const handledF1 = controller.handleGlobalKeyDown(f1Event);
  assertEquals(handledF1, true);
  assertEquals(menuModel.isShortcutsModalOpen, true);
});
