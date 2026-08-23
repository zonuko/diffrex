/**
 * ファイル書き戻し & プロセスライフサイクル (Phase 3) のテスト。
 */

import { assertEquals, assertRejects } from "@std/assert";
import {
  decodeUtf8,
  type FileMetadata,
  hasUtf8Bom,
  readFileTarget,
  resolveSavePath,
  writeFileTarget,
} from "../src/core/file_io.ts";
import type { DiffSessionData } from "../src/core/types.ts";
import { startDesktopServer } from "../src/desktop/window.ts";

Deno.test("resolveSavePath: 保存先パスの解決", () => {
  const sessionWithoutOutput: DiffSessionData = {
    sessionId: "test-session-1",
    timestamp: new Date().toISOString(),
    mode: "2way",
    files: {
      left: { path: "base.ts", content: "base", readOnly: true },
      right: { path: "target.ts", content: "target", readOnly: false },
    },
    hunks: [],
    options: { ignoreSpace: false, ignoreComments: false },
  };
  assertEquals(resolveSavePath(sessionWithoutOutput), "target.ts");

  const sessionWithOutput: DiffSessionData = {
    ...sessionWithoutOutput,
    outputPath: "custom_output.ts",
  };
  assertEquals(resolveSavePath(sessionWithOutput), "custom_output.ts");
});

Deno.test("writeFileTarget: 正常な保存と原子的書き込み", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const filePath = `${tempDir}/output.ts`;
    await Deno.writeTextFile(filePath, "initial content\n");

    const newContent = "const updated = 42;\n";
    await writeFileTarget(filePath, newContent, {
      lineEnding: "lf",
      hasTrailingNewline: true,
      hasBom: false,
    });

    const read = await Deno.readTextFile(filePath);
    assertEquals(read, newContent);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("writeFileTarget: 改行コード (CRLF) の保持", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const filePath = `${tempDir}/crlf_output.txt`;
    const meta: FileMetadata = {
      lineEnding: "crlf",
      hasTrailingNewline: true,
      hasBom: false,
    };

    await writeFileTarget(filePath, "line 1\nline 2", meta);

    const bytes = await Deno.readFile(filePath);
    const raw = new TextDecoder().decode(bytes);
    assertEquals(raw, "line 1\r\nline 2\r\n");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("writeFileTarget: BOM の保持", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const filePath = `${tempDir}/bom_output.txt`;
    const meta: FileMetadata = {
      lineEnding: "lf",
      hasTrailingNewline: false,
      hasBom: true,
    };

    await writeFileTarget(filePath, "hello bom", meta);

    const bytes = await Deno.readFile(filePath);
    assertEquals(hasUtf8Bom(bytes), true);
    assertEquals(decodeUtf8(bytes), "hello bom");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("writeFileTarget: 末尾改行なしの保持", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const filePath = `${tempDir}/no_newline.txt`;
    const meta: FileMetadata = {
      lineEnding: "lf",
      hasTrailingNewline: false,
      hasBom: false,
    };

    await writeFileTarget(filePath, "content without newline\n\n", meta);

    const text = await Deno.readTextFile(filePath);
    assertEquals(text, "content without newline");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("writeFileTarget: readOnly 時および <stdin> でのエラー送出", async () => {
  await assertRejects(
    () =>
      writeFileTarget("sample.ts", "content", undefined, { readOnly: true }),
    Error,
    "cannot write to read-only target",
  );

  await assertRejects(
    () => writeFileTarget("<stdin>", "content"),
    Error,
    "cannot write to read-only target",
  );
});

Deno.test("writeFileTarget: 書き込みエラー時に一時ファイルが残らないこと", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    // 存在しないサブディレクトリへの保存
    const nonExistentPath = `${tempDir}/no_such_dir/output.ts`;
    await assertRejects(
      () => writeFileTarget(nonExistentPath, "content"),
      Error,
      "failed to write file",
    );

    // tempDir 直下に .Diffrex_tmp_ ファイルが残っていないことを確認
    for await (const entry of Deno.readDir(tempDir)) {
      assertEquals(entry.name.startsWith(".Diffrex_tmp_"), false);
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("DesktopServer IPC: save:request と save:result の正常保存フロー", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const rightPath = `${tempDir}/target.ts`;
    await Deno.writeTextFile(rightPath, "console.log('original');\n");

    const rightRes = await readFileTarget(rightPath);
    const metaMap = new Map<string, FileMetadata>();
    metaMap.set(rightPath, rightRes.meta);

    const session: DiffSessionData = {
      sessionId: "ipc-save-test",
      timestamp: new Date().toISOString(),
      mode: "2way",
      files: {
        left: {
          path: "base.ts",
          content: "console.log('base');\n",
          readOnly: true,
        },
        right: rightRes.target,
      },
      hunks: [],
      options: { ignoreSpace: false, ignoreComments: false },
    };

    const serverInstance = startDesktopServer(session, {
      metadataMap: metaMap,
    });

    const ws = new WebSocket(`ws://127.0.0.1:${serverInstance.port}/ws`);
    try {
      await new Promise<void>((resolve) => {
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "ui:ready" }));
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(String(event.data));
          if (msg.type === "session:init") {
            // save:request を送信
            ws.send(
              JSON.stringify({
                type: "save:request",
                content: "console.log('modified via IPC');\n",
              }),
            );
          } else if (msg.type === "save:result") {
            assertEquals(msg.success, true);
            resolve();
          }
        };
      });

      // ファイルに書き戻されていることを確認
      const savedText = await Deno.readTextFile(rightPath);
      assertEquals(savedText, "console.log('modified via IPC');\n");
    } finally {
      ws.close();
      await serverInstance.close();
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("DesktopServer IPC: readOnly ファイルへの save:request で失敗結果を返す", async () => {
  const session: DiffSessionData = {
    sessionId: "ipc-readonly-test",
    timestamp: new Date().toISOString(),
    mode: "2way",
    files: {
      left: { path: "base.ts", content: "base", readOnly: true },
      right: { path: "target.ts", content: "target", readOnly: true },
    },
    hunks: [],
    options: { ignoreSpace: false, ignoreComments: false },
  };

  const serverInstance = startDesktopServer(session);
  const ws = new WebSocket(`ws://127.0.0.1:${serverInstance.port}/ws`);
  try {
    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "ui:ready" }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data));
        if (msg.type === "session:init") {
          ws.send(
            JSON.stringify({
              type: "save:request",
              content: "try to overwrite readonly",
            }),
          );
        } else if (msg.type === "save:result") {
          assertEquals(msg.success, false);
          resolve();
        }
      };
    });
  } finally {
    ws.close();
    await serverInstance.close();
  }
});

Deno.test("DesktopServer IPC: exit:request で指定した exit code を返す", async () => {
  const session: DiffSessionData = {
    sessionId: "ipc-exit-test",
    timestamp: new Date().toISOString(),
    mode: "2way",
    files: {
      left: { path: "base.ts", content: "base", readOnly: true },
      right: { path: "target.ts", content: "target", readOnly: false },
    },
    hunks: [],
    options: { ignoreSpace: false, ignoreComments: false },
  };

  const serverInstance = startDesktopServer(session);
  const ws = new WebSocket(`ws://127.0.0.1:${serverInstance.port}/ws`);
  try {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "exit:request", code: 0 }));
    };

    const code = await serverInstance.waitClosed();
    assertEquals(code, 0);
  } finally {
    ws.close();
    await serverInstance.close();
  }
});
