/**
 * i18n 型定義 & 辞書スキーマ定義 (B18-01)
 *
 * 外部ライブラリ不使用、as const + typeof による英語キー欠落の静的検査を保証する。
 */

export type Locale = "ja" | "en";

export type InterpolationParams = Record<string, string | number>;

/**
 * ネストされたオブジェクトのドット区切りキーパス型を再帰的に生成する。
 */
export type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

/**
 * ネストされたオブジェクトの末端プロパティを string に変換し、
 * オブジェクトのキー構造・階層構造のみを抽出する型ユーティリティ。
 */
export type DeepString<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

// ja.ts から辞書構造の型を抽出して型安全性を保証する
import type { ja } from "./locales/ja.ts";
export type TranslationSchema = typeof ja;
export type TranslationDictionary = DeepString<TranslationSchema>;
export type TranslationKey = NestedKeyOf<TranslationSchema>;
