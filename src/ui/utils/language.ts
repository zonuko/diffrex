import type { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";

/**
 * ファイルパスや拡張子から適切な CodeMirror 言語拡張を取得する。
 */
export function getLanguageExtension(filePath?: string): Extension[] {
  if (!filePath) return [];

  const lower = filePath.toLowerCase();

  if (
    lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts")
  ) {
    return [javascript({ typescript: true })];
  }
  if (lower.endsWith(".tsx")) {
    return [javascript({ typescript: true, jsx: true })];
  }
  if (
    lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")
  ) {
    return [javascript()];
  }
  if (lower.endsWith(".jsx")) {
    return [javascript({ jsx: true })];
  }
  if (lower.endsWith(".json")) {
    return [json()];
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return [markdown()];
  }
  if (lower.endsWith(".py") || lower.endsWith(".pyw")) {
    return [python()];
  }

  return [];
}
