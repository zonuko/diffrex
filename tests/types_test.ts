import { assert, assertEquals } from "@std/assert";
import type {
  DiffMode,
  DiffSessionData,
  FileTarget,
  HunkAnnotation,
  HunkStatus,
  RiskLevel,
} from "../src/core/types.ts";

/** 3-way / outputPath / aiContext を含む完全な `DiffSessionData` を組み立てる。 */
function buildFullSession(): DiffSessionData {
  const left: FileTarget = {
    path: "tests/fixtures/sample_base.ts",
    content: "const a = 1;\n",
    readOnly: true,
  };
  const right: FileTarget = {
    path: "tests/fixtures/sample_target.ts",
    content: "const a = 2;\n",
    readOnly: false,
  };
  const base: FileTarget = {
    path: "tests/fixtures/sample_base.ts",
    content: "const a = 0;\n",
    readOnly: true,
  };

  const hunk: HunkAnnotation = {
    id: "hunk-1",
    lineStartLeft: 1,
    lineEndLeft: 1,
    lineStartRight: 1,
    lineEndRight: 1,
    isNoise: false,
    riskLevel: "danger",
    status: "unreviewed",
    summaryTag: "[Risk] 15 lines deleted",
  };

  return {
    sessionId: crypto.randomUUID(),
    timestamp: new Date(0).toISOString(),
    mode: "3way",
    aiContext: {
      prompt: "リファクタリングして",
      agent: "Junie",
      model: "claude-opus-5",
    },
    files: { left, right, base },
    outputPath: "dist/merged.ts",
    hunks: [hunk],
    options: { ignoreSpace: true, ignoreComments: false },
  };
}

Deno.test("DiffSessionData: 全フィールドを保持できる", () => {
  const session = buildFullSession();

  assertEquals(session.mode, "3way");
  assertEquals(session.timestamp, "1970-01-01T00:00:00.000Z");
  assert(session.sessionId.length > 0);
  assertEquals(session.aiContext?.agent, "Junie");
  assertEquals(session.files.left.readOnly, true);
  assertEquals(session.files.right.readOnly, false);
  assertEquals(session.files.base?.content, "const a = 0;\n");
  assertEquals(session.outputPath, "dist/merged.ts");
  assertEquals(session.options, { ignoreSpace: true, ignoreComments: false });
});

Deno.test("DiffSessionData: 2way では base / outputPath / aiContext を省略できる", () => {
  const full = buildFullSession();
  const session: DiffSessionData = {
    sessionId: full.sessionId,
    timestamp: full.timestamp,
    mode: "2way",
    files: { left: full.files.left, right: full.files.right },
    hunks: [],
    options: { ignoreSpace: false, ignoreComments: false },
  };

  assertEquals(session.mode, "2way");
  assertEquals(session.files.base, undefined);
  assertEquals(session.outputPath, undefined);
  assertEquals(session.aiContext, undefined);
  assertEquals(session.hunks.length, 0);
});

Deno.test("HunkAnnotation: 左右の行範囲と解析結果を保持する", () => {
  const [hunk] = buildFullSession().hunks;

  assertEquals(hunk.id, "hunk-1");
  assertEquals(hunk.lineStartLeft, 1);
  assertEquals(hunk.lineEndLeft, 1);
  assertEquals(hunk.lineStartRight, 1);
  assertEquals(hunk.lineEndRight, 1);
  assertEquals(hunk.isNoise, false);
  assertEquals(hunk.riskLevel, "danger");
  assertEquals(hunk.status, "unreviewed");
  assertEquals(hunk.summaryTag, "[Risk] 15 lines deleted");
});

Deno.test("列挙型: 仕様書5章の取り得る値を網羅する", () => {
  const modes: DiffMode[] = ["2way", "3way"];
  const risks: RiskLevel[] = ["normal", "warning", "danger"];
  const statuses: HunkStatus[] = [
    "unreviewed",
    "accepted",
    "rejected",
    "edited",
  ];

  assertEquals(modes.length, 2);
  assertEquals(risks.length, 3);
  assertEquals(statuses.length, 4);
});
