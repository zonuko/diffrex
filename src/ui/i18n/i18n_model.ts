/**
 * I18nModel (B18-02 Smalltalk-80 MVC Active Domain Model)
 *
 * アプリケーションの国際化言語状態、ロケール自動判定、
 * localStorage 永続化、および型安全な t() 補間関数を提供する。
 */

import { Observable } from "../model/observable.ts";
import type { InterpolationParams, Locale, TranslationKey } from "./types.ts";
import { ja } from "./locales/ja.ts";
import { en } from "./locales/en.ts";

const STORAGE_KEY = "diffrex:locale";

const DICTIONARIES = {
  ja,
  en,
};

/**
 * システムロケールを安全に取得・判定する。
 */
export function detectSystemLocale(): Locale {
  try {
    const lang = globalThis.navigator?.language?.toLowerCase();
    if (lang && lang.startsWith("ja")) {
      return "ja";
    }
  } catch {
    // navigator が参照できない環境
  }
  return "en";
}

/**
 * localStorage から保存済みロケールを安全に読み込む。
 */
export function loadPersistedLocale(): Locale | null {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored === "ja" || stored === "en") {
      return stored;
    }
  } catch {
    // localStorage が利用できない環境
  }
  return null;
}

/**
 * ロケールを localStorage に安全に保存する。
 */
export function persistLocale(locale: Locale): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage が利用できない環境
  }
}

export class I18nModel extends Observable<I18nModel> {
  private _locale: Locale;

  constructor(initialLocale?: Locale) {
    super();
    if (initialLocale) {
      this._locale = initialLocale;
    } else {
      this._locale = loadPersistedLocale() ?? detectSystemLocale();
    }
  }

  get locale(): Locale {
    return this._locale;
  }

  /**
   * 言語を切り替え、localStorage に永続化し、Observer に変更を通知する。
   */
  setLocale(locale: Locale): void {
    if (this._locale !== locale) {
      this._locale = locale;
      persistLocale(locale);
      this.notify(this);
    }
  }

  /**
   * 指定キーの翻訳文字列を取得し、パラメータを補間する。
   *
   * @param key ドット区切りの辞書キー (例: "menu.items.save")
   * @param params 補間パラメータ (例: { count: 3 })
   */
  t(key: TranslationKey, params?: InterpolationParams): string {
    const primaryDict = DICTIONARIES[this._locale];
    const fallbackDict = this._locale === "ja"
      ? DICTIONARIES.en
      : DICTIONARIES.ja;

    let value = this.resolveKey(primaryDict, key);
    if (value === undefined) {
      value = this.resolveKey(fallbackDict, key);
    }

    if (value === undefined) {
      return key;
    }

    if (!params) {
      return String(value);
    }

    // {paramName} 形式の補間置換
    return String(value).replace(
      /\{([a-zA-Z0-9_-]+)\}/g,
      (match, paramName) => {
        if (params && paramName in params) {
          return String(params[paramName]);
        }
        return match;
      },
    );
  }

  /**
   * ドット区切りキーパスを再帰的に解決する。
   */
  // deno-lint-ignore no-explicit-any
  private resolveKey(obj: any, path: string): any {
    if (!obj || typeof obj !== "object") return undefined;
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return typeof current === "string" ? current : undefined;
  }
}

/**
 * アプリケーション全体で共有される既定の I18nModel インスタンス。
 */
export const i18n = new I18nModel();
