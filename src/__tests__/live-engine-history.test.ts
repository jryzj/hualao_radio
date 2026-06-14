import { describe, it, expect, beforeEach } from "vitest";
import {
  buildConversationMessages,
  _testGetHistory,
  _testAppendTurn,
  _testClearHistory,
  type BuildMessagesInput,
  type ConversationTurn,
} from "../lib/live-engine/index";

const THEME_A: BuildMessagesInput = {
  id: "theme-a",
  name: "深夜电台",
  description: "一个安静的深夜聊天节目",
  prompt: "你是{{name}}，一个{{personality}}。当前主题：{{theme.name}}。{{theme.description}}。",
  userPrompt: "听众留言：{{listenerMessages}}\n请生成下一段直播内容。",
  audiencePrompt: "",
  historyRounds: 5,
  persona: { name: "小柔", personality: "温柔的电台主播" },
};

const THEME_B: BuildMessagesInput = {
  ...THEME_A,
  id: "theme-b",
  name: "新闻速递",
  description: "整点新闻播报",
  prompt: "你是{{name}}。",
  userPrompt: "请播报下一条新闻。",
  historyRounds: 2,
  persona: { name: "老张", personality: "严肃的新闻主播" },
};

beforeEach(() => {
  _testClearHistory();
});

describe("buildConversationMessages — messages array construction", () => {
  it("historyRounds=0 returns only [system, current user]", () => {
    const result = buildConversationMessages({ ...THEME_A, historyRounds: 0 }, "", "", []);
    expect(result.messages).toEqual([
      { role: "system", content: expect.stringContaining("小柔") },
      { role: "user", content: "听众留言：\n请生成下一段直播内容。" },
    ]);
  });

  it("historyRounds=N appends last N (user, assistant) pairs before the current user message", () => {
    const history: ConversationTurn[] = [
      { userPrompt: "u1", assistantResponse: "a1", createdAt: 1 },
      { userPrompt: "u2", assistantResponse: "a2", createdAt: 2 },
      { userPrompt: "u3", assistantResponse: "a3", createdAt: 3 },
    ];
    const result = buildConversationMessages({ ...THEME_A, historyRounds: 2 }, "", "", history);
    expect(result.messages).toEqual([
      { role: "system", content: expect.any(String) },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "听众留言：\n请生成下一段直播内容。" },
    ]);
    expect(result.messages).toHaveLength(6);
  });

  it("historyRounds=-1 takes all available history", () => {
    const history: ConversationTurn[] = [
      { userPrompt: "u1", assistantResponse: "a1", createdAt: 1 },
      { userPrompt: "u2", assistantResponse: "a2", createdAt: 2 },
    ];
    const result = buildConversationMessages({ ...THEME_A, historyRounds: -1 }, "", "", history);
    expect(result.messages).toEqual([
      { role: "system", content: expect.any(String) },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "听众留言：\n请生成下一段直播内容。" },
    ]);
    expect(result.messages).toHaveLength(6);
  });

  it("historyRounds larger than available history returns whatever exists (no error)", () => {
    const history: ConversationTurn[] = [
      { userPrompt: "u1", assistantResponse: "a1", createdAt: 1 },
      { userPrompt: "u2", assistantResponse: "a2", createdAt: 2 },
      { userPrompt: "u3", assistantResponse: "a3", createdAt: 3 },
    ];
    const result = buildConversationMessages({ ...THEME_A, historyRounds: 100 }, "", "", history);
    // system + 3 pairs + current user = 8
    expect(result.messages).toHaveLength(8);
    expect(result.messages[1]).toEqual({ role: "user", content: "u1" });
    expect(result.messages[2]).toEqual({ role: "assistant", content: "a1" });
  });

  it("negative historyRounds other than -1 is treated as 0 (Math.max(0, N))", () => {
    const history: ConversationTurn[] = [
      { userPrompt: "u1", assistantResponse: "a1", createdAt: 1 },
    ];
    const result = buildConversationMessages({ ...THEME_A, historyRounds: -5 }, "", "", history);
    // -5 → Math.max(0, -5) = 0, so no history
    expect(result.messages).toEqual([
      { role: "system", content: expect.any(String) },
      { role: "user", content: expect.any(String) },
    ]);
    expect(result.messages).toHaveLength(2);
  });
});

describe("buildConversationMessages — template substitution", () => {
  it("substitutes {{listenerMessages}} in userPrompt when pending messages exist", () => {
    const result = buildConversationMessages(THEME_A, "你好 | 唱首歌", "", []);
    expect(result.currentUserPrompt).toBe("听众留言：你好 | 唱首歌\n请生成下一段直播内容。");
  });

  it("substitutes {{listenerMessages}} with empty string when no pending messages", () => {
    const result = buildConversationMessages(THEME_A, "", "", []);
    expect(result.currentUserPrompt).toBe("听众留言：\n请生成下一段直播内容。");
  });

  it("substitutes {{listenerAuthors}} in userPrompt with '、'-joined author names", () => {
    const themeWithAuthors = { ...THEME_A, userPrompt: "听众：{{listenerAuthors}}\n请生成下一段直播内容。" };
    const result = buildConversationMessages(themeWithAuthors, "", "alice、bob、carol", []);
    expect(result.currentUserPrompt).toBe("听众：alice、bob、carol\n请生成下一段直播内容。");
  });

  it("substitutes {{listenerAuthors}} with empty string when no pending authors", () => {
    const themeWithAuthors = { ...THEME_A, userPrompt: "听众：{{listenerAuthors}}\n请生成下一段直播内容。" };
    const result = buildConversationMessages(themeWithAuthors, "", "", []);
    expect(result.currentUserPrompt).toBe("听众：\n请生成下一段直播内容。");
  });

  it("substitutes {{news}} in userPrompt with newsContext", () => {
    const themeWithNews = { ...THEME_A, userPrompt: "资讯：{{news}}\n请播报。" };
    const result = buildConversationMessages(themeWithNews, "", "", [], "[1] 标题 (来源: BBC)\n内容...");
    expect(result.currentUserPrompt).toBe("资讯：[1] 标题 (来源: BBC)\n内容...\n请播报。");
  });

  it("substitutes {{news}} with empty string when newsContext is empty", () => {
    const themeWithNews = { ...THEME_A, userPrompt: "资讯：{{news}}\n请播报。" };
    const result = buildConversationMessages(themeWithNews, "", "", [], "");
    expect(result.currentUserPrompt).toBe("资讯：\n请播报。");
  });

  it("substitutes {{news}} with empty string by default (5th param omitted)", () => {
    const themeWithNews = { ...THEME_A, userPrompt: "资讯：{{news}}\n请播报。" };
    const result = buildConversationMessages(themeWithNews, "", "", []);
    expect(result.currentUserPrompt).toBe("资讯：\n请播报。");
  });

  it("substitutes {{news}} in audiencePrompt together with {{listenerMessages}}", () => {
    const themeWithBoth = {
      ...THEME_A,
      audiencePrompt: "听众：{{listenerMessages}}\n资讯：{{news}}\n请回应。",
    };
    const news = "[1] OpenAI 融资 (来源: TechCrunch, 2h ago)\nOpenAI 完成了新一轮融资...";
    const result = buildConversationMessages(themeWithBoth, "你好", "alice", [], news);
    expect(result.currentUserPrompt).toBe("听众：你好\n资讯：[1] OpenAI 融资 (来源: TechCrunch, 2h ago)\nOpenAI 完成了新一轮融资...\n请回应。");
  });

  it("substitutes {{name}}, {{personality}}, {{theme.name}}, {{theme.description}} in systemPrompt", () => {
    const result = buildConversationMessages(THEME_A, "", "", []);
    expect(result.systemPrompt).toBe(
      "你是小柔，一个温柔的电台主播。当前主题：深夜电台。一个安静的深夜聊天节目。",
    );
  });

  it("falls back to default systemPrompt when theme.prompt is empty", () => {
    const result = buildConversationMessages({ ...THEME_A, prompt: "" }, "", "", []);
    expect(result.systemPrompt).toContain("你是小柔");
    expect(result.systemPrompt).toContain("温柔的电台主播");
    expect(result.systemPrompt).toContain("深夜电台");
  });

  it("falls back to default userPrompt when theme.userPrompt is empty", () => {
    const result = buildConversationMessages({ ...THEME_A, userPrompt: "" }, "[A]: hi", "", []);
    expect(result.currentUserPrompt).toBe("请生成下一段直播内容。");
  });
});

describe("buildConversationMessages — audiencePrompt selection", () => {
  it("uses audiencePrompt when there are pending messages and audiencePrompt is set", () => {
    const themeWithAudience = {
      ...THEME_A,
      userPrompt: "默认 userPrompt",
      audiencePrompt: "有人留言了：{{listenerMessages}}\n请回应。",
    };
    const result = buildConversationMessages(themeWithAudience, "你好", "A", []);
    expect(result.currentUserPrompt).toBe("有人留言了：你好\n请回应。");
  });

  it("falls back to userPrompt when audiencePrompt is empty even with pending messages", () => {
    const themeWithAudience = {
      ...THEME_A,
      userPrompt: "默认 userPrompt",
      audiencePrompt: "",
    };
    const result = buildConversationMessages(themeWithAudience, "[A]: 你好", "A", []);
    expect(result.currentUserPrompt).toBe("默认 userPrompt");
  });

  it("uses userPrompt (not audiencePrompt) when there are no pending messages", () => {
    const themeWithAudience = {
      ...THEME_A,
      userPrompt: "默认 userPrompt",
      audiencePrompt: "有人留言了：{{listenerMessages}}\n请回应。",
    };
    const result = buildConversationMessages(themeWithAudience, "", "", []);
    expect(result.currentUserPrompt).toBe("默认 userPrompt");
  });

  it("substitutes {{listenerAuthors}} in audiencePrompt", () => {
    const themeWithAudience = {
      ...THEME_A,
      userPrompt: "默认 userPrompt",
      audiencePrompt: "{{listenerAuthors}} 留言：{{listenerMessages}}\n请回应。",
    };
    const result = buildConversationMessages(themeWithAudience, "hi", "alice、bob", []);
    expect(result.currentUserPrompt).toBe("alice、bob 留言：hi\n请回应。");
  });

  it("falls back to hardcoded default when both audiencePrompt and userPrompt are empty (with pending messages)", () => {
    const themeEmpty = { ...THEME_A, userPrompt: "", audiencePrompt: "" };
    const result = buildConversationMessages(themeEmpty, "hi", "A", []);
    expect(result.currentUserPrompt).toBe("请生成下一段直播内容。");
  });
});

describe("in-memory conversation history (per-theme isolation)", () => {
  it("appends a turn and getHistory returns it", () => {
    expect(_testGetHistory(THEME_A.id)).toEqual([]);
    _testAppendTurn(THEME_A.id, { userPrompt: "u1", assistantResponse: "a1", createdAt: 1 });
    expect(_testGetHistory(THEME_A.id)).toEqual([
      { userPrompt: "u1", assistantResponse: "a1", createdAt: 1 },
    ]);
  });

  it("different themes have isolated history", () => {
    _testAppendTurn(THEME_A.id, { userPrompt: "u1", assistantResponse: "a1", createdAt: 1 });
    _testAppendTurn(THEME_B.id, { userPrompt: "uB1", assistantResponse: "aB1", createdAt: 2 });
    expect(_testGetHistory(THEME_A.id)).toHaveLength(1);
    expect(_testGetHistory(THEME_B.id)).toHaveLength(1);
    expect(_testGetHistory(THEME_A.id)[0].userPrompt).toBe("u1");
    expect(_testGetHistory(THEME_B.id)[0].userPrompt).toBe("uB1");
  });

  it("clearHistory(themeId) clears only that theme; clearHistory() clears all", () => {
    _testAppendTurn(THEME_A.id, { userPrompt: "u1", assistantResponse: "a1", createdAt: 1 });
    _testAppendTurn(THEME_B.id, { userPrompt: "uB1", assistantResponse: "aB1", createdAt: 2 });
    _testClearHistory(THEME_A.id);
    expect(_testGetHistory(THEME_A.id)).toEqual([]);
    expect(_testGetHistory(THEME_B.id)).toHaveLength(1);
    _testClearHistory();
    expect(_testGetHistory(THEME_B.id)).toEqual([]);
  });
});
