import { assertEquals, assertStringIncludes } from "@std/assert";
import type { DiffSessionData } from "../src/core/types.ts";
import {
  formatWindowTitle,
  startDesktopServer,
} from "../src/desktop/window.ts";

function createMockSession(): DiffSessionData {
  return {
    sessionId: "test-session-123",
    timestamp: new Date().toISOString(),
    mode: "2way",
    aiContext: {
      prompt: "test prompt",
      agent: "Aider",
      model: "gpt-4o",
    },
    files: {
      left: { path: "src/a.ts", content: "hello left", readOnly: false },
      right: { path: "src/b.ts", content: "hello right", readOnly: false },
    },
    hunks: [],
    options: {
      ignoreSpace: false,
      ignoreComments: false,
    },
  };
}

Deno.test("formatWindowTitle: 正しいタイトルを生成する", () => {
  const session = createMockSession();
  assertEquals(formatWindowTitle(session), "Diffrex - a.ts ⇄ b.ts");
});

Deno.test("DesktopServer: UI HTML および API エンドポイントを配信する", async () => {
  const session = createMockSession();
  const serverInstance = startDesktopServer(session);

  try {
    // 1. GET /
    const htmlRes = await fetch(`${serverInstance.url}/`);
    assertEquals(htmlRes.status, 200);
    const html = await htmlRes.text();
    assertStringIncludes(html, "Diffrex");

    // 2. GET /api/session
    const sessionRes = await fetch(`${serverInstance.url}/api/session`);
    assertEquals(sessionRes.status, 200);
    const sessionJson = await sessionRes.json();
    assertEquals(sessionJson.sessionId, "test-session-123");
    assertEquals(sessionJson.files.left.content, "hello left");
  } finally {
    await serverInstance.close();
  }
});

Deno.test("DesktopServer: WebSocket で ui:ready を受けて session:init を返す", async () => {
  const session = createMockSession();
  let uiReadyTriggered = false;

  const serverInstance = startDesktopServer(session, {
    handlers: {
      onUiReady: () => {
        uiReadyTriggered = true;
      },
    },
  });

  try {
    const wsUrl = serverInstance.url.replace("http://", "ws://") + "/ws";
    const ws = new WebSocket(wsUrl);

    const receivedMessagePromise = new Promise<string>((resolve) => {
      ws.onmessage = (e) => resolve(String(e.data));
    });

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "ui:ready" }));
        resolve();
      };
    });

    const rawMsg = await receivedMessagePromise;
    const msg = JSON.parse(rawMsg);

    assertEquals(msg.type, "session:init");
    assertEquals(msg.data.sessionId, "test-session-123");
    assertEquals(uiReadyTriggered, true);

    ws.close();
  } finally {
    await serverInstance.close();
  }
});
