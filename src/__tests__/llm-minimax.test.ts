import { describe, it, expect, vi, beforeEach } from "vitest";

const MOCK_CONFIG = {
  apiUrl: "https://api.minimaxi.com/v1/text/chatcompletion_v2",
  apiKey: "test-key",
  modelName: "MiniMax-Text-01",
};

describe("Minimax LLM streaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yields text chunks from SSE streaming response", async () => {
    const chunks: string[] = [];

    // Mock fetch to return SSE-style streaming response
    const mockStream = new ReadableStream({
      start(controller) {
        const sseData = [
          'data: {"choices":[{"delta":{"content":"Hello"}}]}',
          'data: {"choices":[{"delta":{"content":" world"}}]}',
          'data: [DONE]',
        ];
        let index = 0;
        const interval = setInterval(() => {
          if (index < sseData.length) {
            controller.enqueue(new TextEncoder().encode(sseData[index] + "\n"));
            index++;
          } else {
            clearInterval(interval);
            controller.close();
          }
        }, 10);
      },
    });

    const mockResponse = {
      ok: true,
      body: mockStream,
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const { streamChat } = await import("../lib/llm/minimax");

    for await (const chunk of streamChat(MOCK_CONFIG, [{ role: "user", content: "Hello" }])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello", " world"]);
  });

  it("throws error on API failure", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const { streamChat } = await import("../lib/llm/minimax");

    await expect(
      streamChat(MOCK_CONFIG, [{ role: "user", content: "Hello" }]).next()
    ).rejects.toThrow("LLM API error: 401");
  });

  it("throws error when response body is empty", async () => {
    const mockResponse = {
      ok: true,
      body: null,
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const { streamChat } = await import("../lib/llm/minimax");

    await expect(
      streamChat(MOCK_CONFIG, [{ role: "user", content: "Hello" }]).next()
    ).rejects.toThrow("LLM API returned empty response body");
  });
});