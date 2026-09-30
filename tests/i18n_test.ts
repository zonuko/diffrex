/**
 * i18n 多言語対応・型安全辞書基盤 テスト (B18-07)
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { detectSystemLocale, I18nModel } from "../src/ui/i18n/i18n_model.ts";
import { ja } from "../src/ui/i18n/locales/ja.ts";
import { en } from "../src/ui/i18n/locales/en.ts";
import { MenuModel } from "../src/ui/model/menu_model.ts";
import { MenuController } from "../src/ui/controller/menu_controller.ts";
import { DiffSessionModel } from "../src/ui/model/diff_session_model.ts";
import { DiffController } from "../src/ui/controller/diff_controller.ts";
import { DirectoryDiffModel } from "../src/ui/model/dir_diff_model.ts";
import { DirectoryController } from "../src/ui/controller/dir_controller.ts";

/**
 * 2つのネストされたオブジェクトのキー構造が完全に同一であるかを再帰的に検証するヘルパー
 */
function getAllKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${k}` : k;
    const val = obj[k];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      keys = keys.concat(getAllKeys(val as Record<string, unknown>, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys.sort();
}

Deno.test("i18n 辞書キー網羅性: ja と en の全キー構造が 1:1 で完全一致する", () => {
  const jaKeys = getAllKeys(ja as unknown as Record<string, unknown>);
  const enKeys = getAllKeys(en as unknown as Record<string, unknown>);

  assertEquals(
    jaKeys.length,
    enKeys.length,
    `キー数が一致しません: ja=${jaKeys.length}, en=${enKeys.length}`,
  );
  assertEquals(jaKeys, enKeys, "辞書キー構造に不一致があります");
});

Deno.test("I18nModel: 基本的な翻訳文字列の取得とパラメータ補間", () => {
  const model = new I18nModel("ja");
  assertEquals(model.locale, "ja");

  // 1. 単純なキー
  assertEquals(model.t("menu.items.save"), "保存");
  assertEquals(model.t("menu.categories.file.label"), "ファイル");

  // 2. パラメータ補間
  assertEquals(
    model.t("header.agent", { agent: "Claude" }),
    "Agent: Claude",
  );
  assertEquals(
    model.t("header.allReviewed", { total: 5 }),
    "✓ 全レビュー完了 (5/5)",
  );
  assertEquals(
    model.t("tabCloseConfirmModal.message", { title: "main.ts" }),
    '"main.ts" への変更が保存されていません。',
  );

  // 3. 英語への切り替え
  model.setLocale("en");
  assertEquals(model.locale, "en");
  assertEquals(model.t("menu.items.save"), "Save");
  assertEquals(model.t("menu.categories.file.label"), "File");
  assertEquals(
    model.t("header.agent", { agent: "Claude" }),
    "Agent: Claude",
  );
  assertEquals(
    model.t("header.allReviewed", { total: 5 }),
    "✓ All Reviewed (5/5)",
  );
  assertEquals(
    model.t("tabCloseConfirmModal.message", { title: "main.ts" }),
    'Changes to "main.ts" have not been saved.',
  );
});

Deno.test("I18nModel: Observable 変更通知が発火する", () => {
  const model = new I18nModel("ja");
  let notified = false;
  let receivedLocale = "";

  const unsub = model.subscribe((m) => {
    notified = true;
    receivedLocale = m.locale;
  });

  model.setLocale("en");
  assertEquals(notified, true);
  assertEquals(receivedLocale, "en");

  // 同一ロケールへの設定では通知されない
  notified = false;
  model.setLocale("en");
  assertEquals(notified, false);

  unsub();
});

Deno.test("I18nModel: localStorage 永続化と復元のラウンドトリップ", () => {
  // モック localStorage
  const storage = new Map<string, string>();
  const origStorage = globalThis.localStorage;

  try {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
        clear: () => storage.clear(),
      },
      configurable: true,
      writable: true,
    });

    const model1 = new I18nModel("ja");
    model1.setLocale("en");
    assertEquals(storage.get("diffrex:locale"), "en");

    // 新規インスタンス作成時に localStorage から "en" が復元される
    const model2 = new I18nModel();
    assertEquals(model2.locale, "en");
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      value: origStorage,
      configurable: true,
      writable: true,
    });
  }
});

Deno.test("I18nModel: システム言語判定 (detectSystemLocale)", () => {
  const origNav = globalThis.navigator;

  try {
    // 1. 日本語環境
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "ja-JP" },
      configurable: true,
      writable: true,
    });
    assertEquals(detectSystemLocale(), "ja");

    // 2. 英語環境
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "en-US" },
      configurable: true,
      writable: true,
    });
    assertEquals(detectSystemLocale(), "en");

    // 3. その他言語
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "fr-FR" },
      configurable: true,
      writable: true,
    });
    assertEquals(detectSystemLocale(), "en");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      value: origNav,
      configurable: true,
      writable: true,
    });
  }
});

function createMock2WaySession(): import("../src/core/types.ts").DiffSessionData {
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

Deno.test("MenuController & CommandPalette: 日英双方向コマンド検索エイリアス", () => {
  const menuModel = new MenuModel();
  const diffModel = new DiffSessionModel();
  diffModel.setSession(createMock2WaySession());
  const diffController = new DiffController(diffModel);
  const dirModel = new DirectoryDiffModel();
  const dirController = new DirectoryController(dirModel, diffModel);

  const menuController = new MenuController(
    menuModel,
    diffModel,
    diffController,
    dirModel,
    dirController,
  );

  // 1. 日本語モードで「保存」も「save」もヒットする
  const resultsJa = menuController.filterCommands("保存");
  assertNotEquals(resultsJa.length, 0);
  assertEquals(resultsJa.some((c) => c.id === "file:save"), true);

  const resultsJaWithEn = menuController.filterCommands("save");
  assertNotEquals(resultsJaWithEn.length, 0);
  assertEquals(resultsJaWithEn.some((c) => c.id === "file:save"), true);

  // 2. 「マージ」も「merge」もヒットする
  const resultsMergeJa = menuController.filterCommands("マージ");
  assertNotEquals(resultsMergeJa.length, 0);

  const resultsMergeEn = menuController.filterCommands("merge");
  assertNotEquals(resultsMergeEn.length, 0);
});

Deno.test("MenuController: View メニュー内に言語切り替えサブメニューが存在する", () => {
  const menuModel = new MenuModel();
  const diffModel = new DiffSessionModel();
  const diffController = new DiffController(diffModel);
  const dirModel = new DirectoryDiffModel();
  const dirController = new DirectoryController(dirModel, diffModel);

  new MenuController(
    menuModel,
    diffModel,
    diffController,
    dirModel,
    dirController,
  );

  const viewCategory = menuModel.categories.find((c) => c.id === "view");
  assertEquals(Boolean(viewCategory), true);

  const langItem = viewCategory?.items.find((item) =>
    item.id === "view:language"
  );
  assertEquals(Boolean(langItem), true);
  assertEquals(
    Boolean(langItem?.children && langItem.children.length === 2),
    true,
  );

  const jaItem = langItem?.children?.find((c) => c.id === "view:lang_ja");
  const enItem = langItem?.children?.find((c) => c.id === "view:lang_en");
  assertEquals(Boolean(jaItem), true);
  assertEquals(Boolean(enItem), true);
});
