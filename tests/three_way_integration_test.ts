import { assertEquals, assertNotEquals } from "@std/assert";
import { parseCliArgs } from "../src/cli/args.ts";
import { validateCliArgs } from "../src/cli/validate.ts";
import { buildSession } from "../src/core/session.ts";
import { readFileTarget } from "../src/core/file_io.ts";
import { ThreeWaySessionModel } from "../src/ui/model/three_way_session_model.ts";
import { ThreeWayController } from "../src/ui/controller/three_way_controller.ts";
import type { UiToBackendMessage } from "../src/desktop/ipc.ts";

Deno.test("3-Way CLI validation & session creation with 3 files", async () => {
  const args = [
    "tests/fixtures/3way/local.ts",
    "tests/fixtures/3way/base.ts",
    "tests/fixtures/3way/remote.ts",
    "-o",
    "tests/fixtures/3way/output.ts",
  ];

  const parsedRes = parseCliArgs(args);
  assertEquals(parsedRes.ok, true);
  if (!parsedRes.ok) return;

  const validRes = await validateCliArgs(parsedRes.parsed);
  assertEquals(validRes.ok, true);
  assertEquals(parsedRes.parsed.mode, "3way");
  assertEquals(parsedRes.parsed.output, "tests/fixtures/3way/output.ts");

  const [leftRes, baseRes, rightRes] = await Promise.all([
    readFileTarget(parsedRes.parsed.left!),
    readFileTarget(parsedRes.parsed.base!),
    readFileTarget(parsedRes.parsed.right!),
  ]);

  const session = buildSession({
    args: parsedRes.parsed,
    left: leftRes.target,
    right: rightRes.target,
    base: baseRes.target,
  });

  assertEquals(session.mode, "3way");
  assertNotEquals(session.threeWay, undefined);
  assertEquals(session.threeWay?.conflictCount, 1);
  assertEquals(session.threeWay?.hunks.length, 1);
  assertEquals(session.threeWay?.hunks[0].type, "conflict");
});

Deno.test("3-Way single conflicted file parsing and session", async () => {
  const args = ["tests/fixtures/3way/conflicted.ts"];

  const parsedRes = parseCliArgs(args);
  assertEquals(parsedRes.ok, true);
  if (!parsedRes.ok) return;

  const validRes = await validateCliArgs(parsedRes.parsed);
  assertEquals(validRes.ok, true);
  assertEquals(parsedRes.parsed.mode, "3way");
  assertEquals(parsedRes.parsed.output, "tests/fixtures/3way/conflicted.ts");

  const fileRes = await readFileTarget(parsedRes.parsed.left!);
  const { parseConflictMarkers, parsedConflictToThreeWayDiff } = await import(
    "../src/core/conflict_parser.ts"
  );
  const parsedConflict = parseConflictMarkers(fileRes.target.content);
  assertEquals(parsedConflict.hasConflicts, true);
  const threeWayInfo = parsedConflictToThreeWayDiff(parsedConflict);

  const session = buildSession({
    args: parsedRes.parsed,
    left: {
      path: "tests/fixtures/3way/conflicted.ts (LOCAL)",
      content: parsedConflict.localContent,
      readOnly: true,
    },
    right: {
      path: "tests/fixtures/3way/conflicted.ts (REMOTE)",
      content: parsedConflict.remoteContent,
      readOnly: true,
    },
    base: {
      path: "tests/fixtures/3way/conflicted.ts (BASE)",
      content: parsedConflict.baseContent,
      readOnly: true,
    },
    threeWayInfo,
  });

  assertEquals(session.mode, "3way");
  assertNotEquals(session.threeWay, undefined);
  assertEquals(session.threeWay?.conflictCount, 1);

  // Model & Controller のマージ操作テスト
  const model = new ThreeWaySessionModel(session);
  const sentMessages: UiToBackendMessage[] = [];
  const controller = new ThreeWayController(model, {
    sendMessage: (msg) => sentMessages.push(msg),
  });

  assertEquals(model.remainingConflictsCount, 1);
  assertEquals(model.totalConflicts, 1);

  // Local を採用
  controller.resolveActiveHunk("local");
  assertEquals(model.remainingConflictsCount, 0);
  assertEquals(
    model.mergedContent.includes("Hello, ${name}! Welcome to Diffrex."),
    true,
  );

  // Remote を採用
  controller.resolveActiveHunk("remote");
  assertEquals(model.remainingConflictsCount, 0);
  assertEquals(
    model.mergedContent.includes("Hi ${name}, welcome to our application."),
    true,
  );

  // 保存要求の送信テスト
  controller.save();
  assertEquals(sentMessages.length, 1);
  assertEquals(sentMessages[0].type, "save:request");
  assertEquals(
    (sentMessages[0] as { content: string }).content,
    model.mergedContent,
  );
});
