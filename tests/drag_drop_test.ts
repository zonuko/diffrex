import { assertEquals, assertExists } from "@std/assert";
import { startDesktopServer } from "../src/desktop/window.ts";
import { DirectoryDiffModel } from "../src/ui/model/dir_diff_model.ts";
import { DirectoryController } from "../src/ui/controller/dir_controller.ts";
import { DiffSessionModel } from "../src/ui/model/diff_session_model.ts";
import type { BackendToUiMessage } from "../src/desktop/ipc.ts";

Deno.test("DragDrop & History: DirectoryDiffModel history operations", () => {
  const model = new DirectoryDiffModel();
  assertEquals(model.history.length, 0);
  assertEquals(model.lastSession, null);

  model.setHistoryData(
    [
      {
        id: "test-1",
        timestamp: new Date().toISOString(),
        mode: "2way",
        leftPath: "a.ts",
        rightPath: "b.ts",
      },
    ],
    {
      timestamp: new Date().toISOString(),
      mode: "2way",
      leftPath: "a.ts",
      rightPath: "b.ts",
    },
  );

  assertEquals(model.history.length, 1);
  assertExists(model.lastSession);

  model.removeHistoryItem("test-1");
  assertEquals(model.history.length, 0);
});

Deno.test("DragDrop & History: WebSocket IPC history and drop message roundtrip", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "diffrex_ipc_b6_" });
  const origHome = Deno.env.get("HOME");
  const origProfile = Deno.env.get("USERPROFILE");

  const fileA = `${tempDir}/drop_a.ts`;
  const fileB = `${tempDir}/drop_b.ts`;
  await Deno.writeTextFile(fileA, "export const a = 1;\n");
  await Deno.writeTextFile(fileB, "export const a = 2;\n");

  try {
    Deno.env.set("HOME", tempDir);
    Deno.env.set("USERPROFILE", tempDir);

    const serverInstance = startDesktopServer({ mode: "welcome" }, {
      hostname: "127.0.0.1",
      port: 0,
    });

    const diffModel = new DiffSessionModel();
    const dirModel = new DirectoryDiffModel();
    const _controller = new DirectoryController(dirModel, diffModel);

    const wsUrl = `ws://127.0.0.1:${serverInstance.port}/ws`;
    const ws = new WebSocket(wsUrl);

    const receivedMessages: BackendToUiMessage[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WS timeout")), 5000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "ui:ready" }));
        ws.send(JSON.stringify({ type: "history:get" }));
        ws.send(
          JSON.stringify({
            type: "file:drop_session",
            paths: [fileA, fileB],
          }),
        );
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data) as BackendToUiMessage;
        receivedMessages.push(msg);
        if (msg.type === "session:init") {
          clearTimeout(timeout);
          resolve();
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        reject(err);
      };
    });

    ws.close();
    await serverInstance.close();

    // history:data と session:init が届いていること
    const hasHistoryData = receivedMessages.some((m) =>
      m.type === "history:data"
    );
    const hasSessionInit = receivedMessages.some((m) =>
      m.type === "session:init"
    );

    assertEquals(hasHistoryData, true);
    assertEquals(hasSessionInit, true);
  } finally {
    if (origHome) Deno.env.set("HOME", origHome);
    if (origProfile) Deno.env.set("USERPROFILE", origProfile);
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  }
});
