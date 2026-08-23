import { assertEquals } from "@std/assert";
import {
  hasConflictMarkers,
  parseConflictMarkers,
} from "../src/core/conflict_parser.ts";

Deno.test("hasConflictMarkers detects Git conflict markers", () => {
  const normalText = `function hello() {\n  console.log("hello");\n}`;
  assertEquals(hasConflictMarkers(normalText), false);

  const conflictText = `function hello() {
<<<<<<< HEAD
  console.log("local");
=======
  console.log("remote");
>>>>>>> feature
}`;
  assertEquals(hasConflictMarkers(conflictText), true);
});

Deno.test("parseConflictMarkers correctly parses standard 2-way conflict markers", () => {
  const conflicted = `import { foo } from "./foo.ts";

<<<<<<< HEAD
const greeting = "Hello from Local";
=======
const greeting = "Hello from Remote";
>>>>>>> branch-a

export function run() {
  console.log(greeting);
}`;

  const parsed = parseConflictMarkers(conflicted);
  assertEquals(parsed.hasConflicts, true);
  assertEquals(parsed.conflicts.length, 1);

  const c = parsed.conflicts[0];
  assertEquals(c.localName, "HEAD");
  assertEquals(c.remoteName, "branch-a");
  assertEquals(c.localLines, ['const greeting = "Hello from Local";']);
  assertEquals(c.remoteLines, ['const greeting = "Hello from Remote";']);

  // 復元テキストの検証
  assertEquals(
    parsed.localContent,
    `import { foo } from "./foo.ts";\n\nconst greeting = "Hello from Local";\n\nexport function run() {\n  console.log(greeting);\n}`,
  );
  assertEquals(
    parsed.remoteContent,
    `import { foo } from "./foo.ts";\n\nconst greeting = "Hello from Remote";\n\nexport function run() {\n  console.log(greeting);\n}`,
  );
});

Deno.test("parseConflictMarkers correctly parses diff3 format with base", () => {
  const diff3Text = `export function add(a: number, b: number): number {
<<<<<<< HEAD
  // local implementation with logging
  console.log("add called");
  return a + b;
||||||| merged common ancestors
  return a + b;
=======
  // remote implementation with validation
  if (isNaN(a) || isNaN(b)) throw new Error("invalid");
  return a + b;
>>>>>>> feature-validate
}`;

  const parsed = parseConflictMarkers(diff3Text);
  assertEquals(parsed.hasConflicts, true);
  assertEquals(parsed.conflicts.length, 1);

  const c = parsed.conflicts[0];
  assertEquals(c.baseName, "merged common ancestors");
  assertEquals(c.baseLines, ["  return a + b;"]);
  assertEquals(c.localLines.length, 3);
  assertEquals(c.remoteLines.length, 3);
  assertEquals(
    parsed.baseContent,
    `export function add(a: number, b: number): number {\n  return a + b;\n}`,
  );
});
