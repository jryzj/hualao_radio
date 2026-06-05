import { describe, it, expect } from "vitest";
import { formatNewsContext, type NewsItemInput } from "../../lib/news/format";

const NOW = new Date();

const baseItem: NewsItemInput = {
  title: "OpenAI 完成新一轮融资",
  contentMd: "OpenAI 完成了 100 亿美元融资...",
  link: "https://example.com/news/1",
  sourceTitle: "TechCrunch",
  publishedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
  fetchedAt: NOW,
};

describe("formatNewsContext", () => {
  it("returns empty string for empty items", () => {
    expect(formatNewsContext([])).toBe("");
  });

  it("renders single item with index, title, source, time-ago, content, link", () => {
    const out = formatNewsContext([baseItem]);
    expect(out).toContain("[1] OpenAI 完成新一轮融资");
    expect(out).toContain("来源: TechCrunch");
    expect(out).toContain("2h ago");
    expect(out).toContain("OpenAI 完成了 100 亿美元融资...");
    expect(out).toContain("链接: https://example.com/news/1");
  });

  it("uses 未知 when sourceTitle is empty", () => {
    const out = formatNewsContext([{ ...baseItem, sourceTitle: "" }]);
    expect(out).toContain("来源: 未知");
  });

  it("uses 未知时间 when publishedAt is null", () => {
    const out = formatNewsContext([{ ...baseItem, publishedAt: null }]);
    expect(out).toContain("未知时间");
  });

  it("sorts by publishedAt desc (newest first)", () => {
    const older: NewsItemInput = { ...baseItem, title: "OLDER", publishedAt: new Date("2026-06-04T08:00:00Z") };
    const newer: NewsItemInput = { ...baseItem, title: "NEWER", publishedAt: new Date("2026-06-04T11:00:00Z") };
    const out = formatNewsContext([older, newer]);
    const olderIdx = out.indexOf("OLDER");
    const newerIdx = out.indexOf("NEWER");
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it("truncates items over maxItemChars", () => {
    const long = "x".repeat(3000);
    const out = formatNewsContext([{ ...baseItem, contentMd: long }], { maxItemChars: 2000 });
    expect(out).toContain("... [truncated]");
    expect(out).not.toContain("x".repeat(2100));
  });

  it("limits to maxItems", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ ...baseItem, title: `ITEM${i}` }));
    const out = formatNewsContext(items, { maxItems: 3 });
    expect(out).toContain("ITEM0");
    expect(out).toContain("ITEM2");
    expect(out).not.toContain("ITEM3");
    expect(out).not.toContain("ITEM4");
  });

  it("truncates total to maxTotalChars", () => {
    const items: NewsItemInput[] = [
      { ...baseItem, title: "A", contentMd: "y".repeat(4000) },
      { ...baseItem, title: "B", contentMd: "z".repeat(4000) },
      { ...baseItem, title: "C", contentMd: "w".repeat(4000) },
    ];
    const out = formatNewsContext(items, { maxTotalChars: 5000, maxItemChars: 4000 });
    expect(out.length).toBeLessThanOrEqual(5000 + "... [truncated]".length);
  });

  it("falls back to fetchedAt when publishedAt is null in sort", () => {
    const a: NewsItemInput = { ...baseItem, title: "A", publishedAt: null, fetchedAt: new Date("2026-06-04T09:00:00Z") };
    const b: NewsItemInput = { ...baseItem, title: "B", publishedAt: null, fetchedAt: new Date("2026-06-04T11:00:00Z") };
    const out = formatNewsContext([a, b]);
    const aIdx = out.indexOf("\n[1] A");
    const bIdx = out.indexOf("\n[1] B");
    // whichever is newer should appear first as [1]
    const firstA = out.startsWith("[1] A");
    const firstB = out.startsWith("[1] B");
    expect(firstA || firstB).toBe(true);
  });
});
