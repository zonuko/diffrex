import { assertEquals } from "@std/assert";
import { computeThreeWayDiff } from "../src/core/three_way.ts";

Deno.test("computeThreeWayDiff handles clean merges without conflicts", () => {
  const base = `function calculate() {
  const a = 1;
  const b = 2;
  return a + b;
}`;

  // Local changes line 2
  const local = `function calculate() {
  const a = 10;
  const b = 2;
  return a + b;
}`;

  // Remote changes line 3
  const remote = `function calculate() {
  const a = 1;
  const b = 20;
  return a + b;
}`;

  const result = computeThreeWayDiff(base, local, remote);
  assertEquals(result.conflictCount, 0);
  assertEquals(result.cleanMergePossible, true);
  assertEquals(
    result.initialMergedContent,
    `function calculate() {
  const a = 10;
  const b = 20;
  return a + b;
}`,
  );
});

Deno.test("computeThreeWayDiff detects conflicting edits on the same lines", () => {
  const base = `const value = "initial";`;
  const local = `const value = "local modification";`;
  const remote = `const value = "remote modification";`;

  const result = computeThreeWayDiff(base, local, remote);
  assertEquals(result.conflictCount, 1);
  assertEquals(result.cleanMergePossible, false);
  assertEquals(result.hunks[0].type, "conflict");
  assertEquals(result.hunks[0].resolution, "unresolved");
  assertEquals(result.hunks[0].localLines, [
    'const value = "local modification";',
  ]);
  assertEquals(result.hunks[0].remoteLines, [
    'const value = "remote modification";',
  ]);
});

Deno.test("computeThreeWayDiff handles identical changes from both sides cleanly", () => {
  const base = `const title = "My App";`;
  const local = `const title = "My Awesome App";`;
  const remote = `const title = "My Awesome App";`;

  const result = computeThreeWayDiff(base, local, remote);
  assertEquals(result.conflictCount, 0);
  assertEquals(result.cleanMergePossible, true);
  assertEquals(result.initialMergedContent, `const title = "My Awesome App";`);
});
