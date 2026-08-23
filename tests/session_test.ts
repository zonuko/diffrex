import { assert, assertEquals } from "@std/assert";
import { parseCliArgs } from "../src/cli/args.ts";
import { buildSession } from "../src/core/session.ts";

Deno.test("buildSession: 2-Way セッションを構築できる", () => {
  const parseRes = parseCliArgs([
    "fileA.ts",
    "fileB.ts",
    "--prompt",
    "refactor code",
    "--agent",
    "Cursor",
    "--model",
    "claude-3-7-sonnet",
  ]);
  assert(parseRes.ok);

  const left = { path: "fileA.ts", content: "const a = 1;", readOnly: false };
  const right = { path: "fileB.ts", content: "const a = 2;", readOnly: false };

  const session = buildSession({
    args: parseRes.parsed,
    left,
    right,
  });

  assertEquals(session.mode, "2way");
  assert(session.sessionId.length > 0);
  assert(!isNaN(Date.parse(session.timestamp)));
  assertEquals(session.files.left, left);
  assertEquals(session.files.right, right);
  assertEquals(session.files.base, undefined);
  assertEquals(session.aiContext?.prompt, "refactor code");
  assertEquals(session.aiContext?.agent, "Cursor");
  assertEquals(session.aiContext?.model, "claude-3-7-sonnet");
  assertEquals(session.hunks.length, 1);
  assertEquals(session.hunks[0].status, "unreviewed");
  assertEquals(session.hunks[0].riskLevel, "normal");
});

Deno.test("buildSession: 3-Way セッションを構築できる", () => {
  const parseRes = parseCliArgs([
    "local.ts",
    "base.ts",
    "remote.ts",
    "-o",
    "merged.ts",
  ]);
  assert(parseRes.ok);

  const left = { path: "local.ts", content: "local", readOnly: false };
  const base = { path: "base.ts", content: "base", readOnly: false };
  const right = { path: "remote.ts", content: "remote", readOnly: false };

  const session = buildSession({
    args: parseRes.parsed,
    left,
    right,
    base,
  });

  assertEquals(session.mode, "3way");
  assertEquals(session.files.left, left);
  assertEquals(session.files.base, base);
  assertEquals(session.files.right, right);
  assertEquals(session.outputPath, "merged.ts");
  assertEquals(session.aiContext, undefined);
});
