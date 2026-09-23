/**
 * tests/jev_client_test.ts
 *
 * TypeSafe Jev (System One) API クライアントの単体テスト (B19-01, B19-05)。
 */

import { assertEquals, assertRejects } from "@std/assert";
import { JevClient } from "../src/core/analysis/jev_client.ts";

Deno.test("JevClient: isConfigured の判定", () => {
  const unconfigured = new JevClient({ apiKey: "" });
  assertEquals(unconfigured.isConfigured(), false);

  const configured = new JevClient({ apiKey: "test-key-123" });
  assertEquals(configured.isConfigured(), true);
});

Deno.test("JevClient: API キー未設定時の呼び出し拒否", async () => {
  const client = new JevClient({ apiKey: "" });
  await assertRejects(
    () =>
      client.systemOne({
        state: "test state",
        questions: {
          q1: { type: "noul", instructions: "is valid?" },
        },
      }),
    Error,
    "TYPESAFE_API_KEY is not configured.",
  );
});

Deno.test("JevClient: モックサーバーとのリクエスト・レスポンス通信検証", async () => {
  let receivedAuthHeader = "";
  let receivedBody: Record<string, unknown> = {};

  const server = Deno.serve({ port: 0 }, async (req) => {
    receivedAuthHeader = req.headers.get("Authorization") ?? "";
    receivedBody = await req.json();

    return Response.json({
      model: "jev-1.13.0",
      answers: {
        risk_level: {
          type: "choice",
          choice: "danger",
          confidence: 0.92,
          probabilities: {
            danger: 0.92,
            warning: 0.08,
            normal: 0.0,
          },
        },
        intent_alignment: {
          type: "score",
          score: 2,
          confidence: 0.95,
          probabilities: { "2": 0.95 },
        },
        is_cosmetic_noise: {
          type: "noul",
          noul: 0.1,
        },
      },
      usage: {
        input_tokens: 150,
        output_tokens: 30,
      },
    });
  });

  const port = (server.addr as Deno.NetAddr).port;
  const baseUrl = `http://127.0.0.1:${port}/v1/systemone`;

  try {
    const client = new JevClient({
      apiKey: "secret-token-xyz",
      baseUrl,
    });

    const res = await client.systemOne({
      state: "function add(a, b) { return a + b; }",
      questions: {
        risk_level: {
          type: "choice",
          instructions: "risk",
          criteria: { danger: "danger", normal: "normal" },
        },
      },
    });

    assertEquals(receivedAuthHeader, "Bearer secret-token-xyz");
    assertEquals(receivedBody.state, "function add(a, b) { return a + b; }");
    assertEquals(receivedBody.model, "jev-latest");

    assertEquals(res.model, "jev-1.13.0");
    const risk = res.answers["risk_level"];
    assertEquals(risk.type, "choice");
    if (risk.type === "choice") {
      assertEquals(risk.choice, "danger");
      assertEquals(risk.confidence, 0.92);
      assertEquals(risk.probabilities?.danger, 0.92);
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("JevClient: サーバーエラーレスポンスの例外ハンドリング", async () => {
  const server = Deno.serve({ port: 0 }, () => {
    return new Response("Internal Server Error", {
      status: 500,
      statusText: "Internal Server Error",
    });
  });

  const port = (server.addr as Deno.NetAddr).port;
  const baseUrl = `http://127.0.0.1:${port}/v1/systemone`;

  try {
    const client = new JevClient({
      apiKey: "valid-key",
      baseUrl,
    });

    await assertRejects(
      () =>
        client.systemOne({
          state: "hello",
          questions: {},
        }),
      Error,
      "TypeSafe API error (500 Internal Server Error)",
    );
  } finally {
    await server.shutdown();
  }
});
