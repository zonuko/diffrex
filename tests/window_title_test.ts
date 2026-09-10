import { assertEquals } from "@std/assert";
import { formatWindowTitle } from "../src/desktop/window.ts";
import type {
  DiffSessionData,
  DirectoryDiffSessionData,
} from "../src/core/types.ts";

Deno.test("formatWindowTitle - welcome mode", () => {
  assertEquals(formatWindowTitle({ mode: "welcome" }), "Diffrex");
  assertEquals(formatWindowTitle({ mode: "welcome" }, true), "* Diffrex");
});

Deno.test("formatWindowTitle - 2way normal text", () => {
  const session: DiffSessionData = {
    sessionId: "test-1",
    timestamp: new Date().toISOString(),
    mode: "2way",
    files: {
      left: { path: "src/old.ts", content: "", readOnly: true },
      right: { path: "src/new.ts", content: "", readOnly: false },
    },
    hunks: [],
    options: { ignoreSpace: false, ignoreComments: false },
  };

  assertEquals(formatWindowTitle(session), "Diffrex - old.ts ⇄ new.ts");
  assertEquals(formatWindowTitle(session, true), "* Diffrex - old.ts ⇄ new.ts");
});

Deno.test("formatWindowTitle - 3way merge mode", () => {
  const session: DiffSessionData = {
    sessionId: "test-2",
    timestamp: new Date().toISOString(),
    mode: "3way",
    files: {
      left: { path: "local.ts", content: "", readOnly: false },
      right: { path: "remote.ts", content: "", readOnly: false },
      base: { path: "base.ts", content: "", readOnly: true },
    },
    hunks: [],
    options: { ignoreSpace: false, ignoreComments: false },
  };

  assertEquals(
    formatWindowTitle(session),
    "Diffrex - 💥 [3-Way] local.ts ⇄ base.ts ⇄ remote.ts",
  );
  assertEquals(
    formatWindowTitle(session, true),
    "* Diffrex - 💥 [3-Way] local.ts ⇄ base.ts ⇄ remote.ts",
  );

  // 単一コンフリクトファイルの場合
  const conflictSession: DiffSessionData = {
    sessionId: "test-3",
    timestamp: new Date().toISOString(),
    mode: "3way",
    files: {
      left: { path: "conflicted.ts", content: "", readOnly: false },
      right: { path: "conflicted.ts", content: "", readOnly: false },
      base: { path: "conflicted.ts", content: "", readOnly: true },
    },
    hunks: [],
    options: { ignoreSpace: false, ignoreComments: false },
  };

  assertEquals(
    formatWindowTitle(conflictSession),
    "Diffrex - 💥 conflicted.ts (3-Way Merge)",
  );
  assertEquals(
    formatWindowTitle(conflictSession, true),
    "* Diffrex - 💥 conflicted.ts (3-Way Merge)",
  );
});

Deno.test("formatWindowTitle - directory mode (normal & git)", () => {
  const dirSession: DirectoryDiffSessionData = {
    sessionId: "test-dir-1",
    timestamp: new Date().toISOString(),
    mode: "directory",
    baseDir: "C:/projects/dir_base",
    targetDir: "C:/projects/dir_target",
    readOnly: false,
    tree: {
      name: "root",
      relativePath: "",
      isDir: true,
      status: "identical",
      children: [],
    },
    summary: {
      total: 0,
      modified: 0,
      added: 0,
      deleted: 0,
      identical: 0,
      binary: 0,
      image: 0,
    },
  };

  assertEquals(
    formatWindowTitle(dirSession),
    "Diffrex - 📁 dir_base ⇄ 📁 dir_target",
  );
  assertEquals(
    formatWindowTitle(dirSession, true),
    "* Diffrex - 📁 dir_base ⇄ 📁 dir_target",
  );

  // Git リポジトリ
  const gitSession: DirectoryDiffSessionData = {
    ...dirSession,
    isGitRepo: true,
    git: {
      isGitRepo: true,
      branch: "feature/awesome",
    },
  };

  assertEquals(
    formatWindowTitle(gitSession),
    "Diffrex - 🌿 dir_target (feature/awesome) (HEAD vs Working Tree)",
  );
  assertEquals(
    formatWindowTitle(gitSession, true),
    "* Diffrex - 🌿 dir_target (feature/awesome) (HEAD vs Working Tree)",
  );
});

Deno.test("formatWindowTitle - image and csv diff modes", () => {
  const imgSession: DiffSessionData = {
    sessionId: "test-img",
    timestamp: new Date().toISOString(),
    mode: "image",
    files: {
      left: { path: "logo_v1.png", content: "", readOnly: true },
      right: { path: "logo_v2.png", content: "", readOnly: true },
    },
    imageSession: {
      sessionId: "img-1",
      timestamp: new Date().toISOString(),
      mode: "image",
      left: {
        path: "logo_v1.png",
        dataUrl: "",
        mimeType: "image/png",
        sizeBytes: 100,
      },
      right: {
        path: "logo_v2.png",
        dataUrl: "",
        mimeType: "image/png",
        sizeBytes: 100,
      },
      readOnly: true,
    },
    hunks: [],
    options: { ignoreSpace: false, ignoreComments: false },
  };

  assertEquals(
    formatWindowTitle(imgSession),
    "Diffrex - 🖼️ logo_v1.png ⇄ logo_v2.png",
  );

  const csvSession: DiffSessionData = {
    sessionId: "test-csv",
    timestamp: new Date().toISOString(),
    mode: "csv",
    files: {
      left: { path: "data_v1.csv", content: "", readOnly: true },
      right: { path: "data_v2.csv", content: "", readOnly: false },
    },
    hunks: [],
    options: { ignoreSpace: false, ignoreComments: false },
  };

  assertEquals(
    formatWindowTitle(csvSession),
    "Diffrex - 📊 data_v1.csv ⇄ data_v2.csv",
  );
});
