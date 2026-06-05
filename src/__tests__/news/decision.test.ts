import { describe, it, expect } from "vitest";
import { parseDecisionOutput, buildDecisionUserPrompt } from "../../lib/news/decision";

describe("parseDecisionOutput", () => {
  it("parses QUERY: format", () => {
    expect(parseDecisionOutput("QUERY: chatgpt 融资")).toEqual({ need: true, query: "chatgpt 融资" });
  });

  it("handles whitespace after QUERY:", () => {
    expect(parseDecisionOutput("QUERY:    苹果发布会")).toEqual({ need: true, query: "苹果发布会" });
  });

  it("handles trailing newline", () => {
    expect(parseDecisionOutput("QUERY: bitcoin price\n")).toEqual({ need: true, query: "bitcoin price" });
  });

  it("parses NO_NEWS", () => {
    expect(parseDecisionOutput("NO_NEWS")).toEqual({ need: false, query: "" });
  });

  it("parses NO_NEWS with trailing whitespace", () => {
    expect(parseDecisionOutput("NO_NEWS\n")).toEqual({ need: false, query: "" });
  });

  it("treats unrecognized output as NO_NEWS", () => {
    expect(parseDecisionOutput("I don't know")).toEqual({ need: false, query: "" });
  });

  it("treats empty output as NO_NEWS", () => {
    expect(parseDecisionOutput("")).toEqual({ need: false, query: "" });
  });

  it("finds QUERY: even when surrounded by other text", () => {
    expect(parseDecisionOutput("Some prefix\nQUERY: 体育新闻\nMore text")).toEqual({
      need: true,
      query: "体育新闻",
    });
  });

  it("takes the first QUERY: line if multiple", () => {
    expect(parseDecisionOutput("QUERY: first\nQUERY: second")).toEqual({
      need: true,
      query: "first",
    });
  });
});

describe("buildDecisionUserPrompt", () => {
  it("includes theme name, description, and current time", () => {
    const s = buildDecisionUserPrompt({
      themeName: "深夜电台",
      themeDescription: "聊天节目",
      recentHistory: "",
      currentTime: "2026-06-04T12:00:00Z",
      pendingMessages: "",
    });
    expect(s).toContain("深夜电台");
    expect(s).toContain("聊天节目");
    expect(s).toContain("2026-06-04T12:00:00Z");
  });
});
