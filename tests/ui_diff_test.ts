import { assertEquals } from "@std/assert";
import { getLanguageExtension } from "../src/ui/utils/language.ts";

Deno.test("getLanguageExtension: 各種拡張子に対して適切な言語拡張を返す", () => {
  assertEquals(getLanguageExtension("file.ts").length, 1);
  assertEquals(getLanguageExtension("file.tsx").length, 1);
  assertEquals(getLanguageExtension("file.js").length, 1);
  assertEquals(getLanguageExtension("file.jsx").length, 1);
  assertEquals(getLanguageExtension("file.json").length, 1);
  assertEquals(getLanguageExtension("file.md").length, 1);
  assertEquals(getLanguageExtension("file.py").length, 1);
  assertEquals(getLanguageExtension("file.unknown").length, 0);
  assertEquals(getLanguageExtension(undefined).length, 0);
});
