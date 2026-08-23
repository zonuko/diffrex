/**
 * JSON / YAML 構造化データの正規化およびセマンティック比較テスト（B-5）。
 */
import { assertEquals } from "@std/assert";
import {
  canonicalizeJson,
  isSemanticallyEqualJson,
} from "../src/core/structured/json_canonicalizer.ts";
import {
  canonicalizeYaml,
  isSemanticallyEqualYaml,
} from "../src/core/structured/yaml_canonicalizer.ts";
import { buildSession } from "../src/core/session.ts";

Deno.test("canonicalizeJson - sorts object keys alphabetically", () => {
  const input = `{
    "z": 1,
    "a": 2,
    "nested": {
      "foo": "bar",
      "apple": "banana"
    }
  }`;

  const res = canonicalizeJson(input);
  assertEquals(res.success, true);
  const parsed = JSON.parse(res.content);
  const keys = Object.keys(parsed);
  assertEquals(keys, ["a", "nested", "z"]);
  assertEquals(Object.keys(parsed.nested), ["apple", "foo"]);
});

Deno.test("isSemanticallyEqualJson - detects equal JSON with different key orders", () => {
  const jsonA = '{"name": "Alice", "age": 30, "city": "Tokyo"}';
  const jsonB = '{"city": "Tokyo", "name": "Alice", "age": 30}';
  const jsonC = '{"name": "Alice", "age": 31, "city": "Tokyo"}';

  assertEquals(isSemanticallyEqualJson(jsonA, jsonB), true);
  assertEquals(isSemanticallyEqualJson(jsonA, jsonC), false);
});

Deno.test("canonicalizeYaml - sorts YAML object keys and stringifies", () => {
  const yamlInput = `
z: 100
a: 200
nested:
  beta: 2
  alpha: 1
`;
  const res = canonicalizeYaml(yamlInput);
  assertEquals(res.success, true);
  // 正しくパース・ソートされていること
  assertEquals(
    res.content.indexOf("a: 200") < res.content.indexOf("z: 100"),
    true,
  );
});

Deno.test("isSemanticallyEqualYaml - detects equal YAML with different key orders", () => {
  const yamlA = `
version: "1.0"
name: Diffrex
settings:
  theme: dark
  fontSize: 14
`;
  const yamlB = `
name: Diffrex
version: "1.0"
settings:
  fontSize: 14
  theme: dark
`;
  const yamlC = `
name: Diffrex
version: "2.0"
`;
  assertEquals(isSemanticallyEqualYaml(yamlA, yamlB), true);
  assertEquals(isSemanticallyEqualYaml(yamlA, yamlC), false);
});

Deno.test("buildSession - marks JSON key reordering diffs as noise", () => {
  const jsonA = '{\n  "b": 2,\n  "a": 1\n}\n';
  const jsonB = '{\n  "a": 1,\n  "b": 2\n}\n';

  const session = buildSession({
    args: {
      mode: "2way",
      positional: ["a.json", "b.json"],
      left: "a.json",
      right: "b.json",
      wait: false,
      readOnly: false,
      ignoreSpace: false,
      ignoreComments: false,
      help: false,
      version: false,
    },
    left: { path: "a.json", content: jsonA, readOnly: true },
    right: { path: "b.json", content: jsonB, readOnly: false },
  });

  assertEquals(session.hunks.length > 0, true);
  for (const hunk of session.hunks) {
    assertEquals(hunk.isNoise, true);
    assertEquals(hunk.summaryTag, "[Format] Key reordering");
  }
});
