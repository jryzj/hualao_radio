import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const MOCK_CONFIG = {
  apiUrl: "https://api.example.com/v1/chat",
  apiKey: "test-key",
  modelName: "test-model",
};

const MOCK_PROMPT = "审核留言：{{content}} 作者：{{authorName}}";

vi.mock("@/config", () => ({
  getLLMConfig: vi.fn(),
  getModerationPrompt: vi.fn(),
}));

import { getLLMConfig, getModerationPrompt } from "@/config";
import { moderateMessage } from "@/lib/moderation";

const mockedGetLLMConfig = vi.mocked(getLLMConfig);
const mockedGetModerationPrompt = vi.mocked(getModerationPrompt);

function mockLLMResponse(content: string) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  }));
}

describe("moderateMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLLMConfig.mockResolvedValue(MOCK_CONFIG);
    mockedGetModerationPrompt.mockResolvedValue(MOCK_PROMPT);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns approved with reason '未启用审核' when LLM is not configured", async () => {
    mockedGetLLMConfig.mockResolvedValue(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "approved", reason: "未启用审核" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns approved with reason '未启用审核' when Prompt is not configured", async () => {
    mockedGetModerationPrompt.mockResolvedValue(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "approved", reason: "未启用审核" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses JSON {passed:true, reason:'x'} and returns reason from LLM", async () => {
    mockLLMResponse('{"passed":true,"reason":"内容健康"}');

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "approved", reason: "内容健康" });
  });

  it("parses JSON {passed:false, reason:'x'} and returns reason from LLM", async () => {
    mockLLMResponse('{"passed":false,"reason":"包含广告"}');

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "rejected", reason: "包含广告" });
  });

  it("falls back to 'LLM 通过' when JSON has passed:true with no reason", async () => {
    mockLLMResponse('{"passed":true}');

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "approved", reason: "LLM 通过" });
  });

  it("falls back to keyword 'approve' when JSON parse fails and text contains approve", async () => {
    mockLLMResponse("approve");

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "approved", reason: "LLM 关键词兜底" });
  });

  it("does NOT match 'disapprove' due to word boundary", async () => {
    mockLLMResponse("disapprove");

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "pending", reason: "LLM 调用失败，待人工" });
  });

  it("returns pending when JSON fails and no keyword match", async () => {
    mockLLMResponse("some other text");

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "pending", reason: "LLM 调用失败，待人工" });
  });

  it("returns pending on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "pending", reason: "LLM 调用失败，待人工" });
  });

  it("aborts after 30s timeout when fetch never resolves", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      return new Promise((_, reject) => {
        opts.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const resultPromise = moderateMessage("hello", "user");
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await resultPromise;

    expect(result).toEqual({ status: "pending", reason: "LLM 调用失败，待人工" });
  });

  it("JSON wins when JSON says passed:false but reason text contains 'approve'", async () => {
    mockLLMResponse('{"passed":false,"reason":"I would approve this spam"}');

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "rejected", reason: "I would approve this spam" });
  });

  it("keyword branch catches 'I think we should approve' even when JSON parse fails", async () => {
    mockLLMResponse("I think we should approve");

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "approved", reason: "LLM 关键词兜底" });
  });

  it("falls through JSON branch when 'passed' is a non-boolean string and matches keyword", async () => {
    mockLLMResponse('{"passed":"yes","reason":"maybe"} approve');

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "approved", reason: "LLM 关键词兜底" });
  });

  it("falls through JSON branch when 'passed' is non-boolean and no keyword match", async () => {
    mockLLMResponse('{"passed":"yes","reason":"maybe"}');

    const result = await moderateMessage("hello", "user");
    expect(result).toEqual({ status: "pending", reason: "LLM 调用失败，待人工" });
  });

  it("forwards an AbortSignal to fetch", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "approve" } }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await moderateMessage("hello", "user");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(callArgs.signal).toBeInstanceOf(AbortSignal);
  });

  it("substitutes {{content}} and {{authorName}} placeholders in the prompt template", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "approve" } }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await moderateMessage("nice content", "alice");

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    const sentPrompt = body.messages[0].content;
    expect(sentPrompt).toContain("nice content");
    expect(sentPrompt).toContain("alice");
    expect(sentPrompt).not.toContain("{{content}}");
    expect(sentPrompt).not.toContain("{{authorName}}");
  });
});
