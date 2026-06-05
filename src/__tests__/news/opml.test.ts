import { describe, it, expect } from "vitest";
import { parseOpml } from "../../lib/news/opml";

const VALID_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>My Feeds</title>
  </head>
  <body>
    <outline text="Tech" title="Tech">
      <outline type="rss" text="TechCrunch" title="TechCrunch" xmlUrl="https://techcrunch.com/feed/" htmlUrl="https://techcrunch.com" />
      <outline type="atom" text="The Verge" title="The Verge" xmlUrl="https://www.theverge.com/rss/index.xml" />
    </outline>
    <outline type="rss" text="BBC News" title="BBC News" xmlUrl="https://feeds.bbci.co.uk/news/rss.xml" htmlUrl="https://www.bbc.com/news" language="en" />
  </body>
</opml>`;

describe("parseOpml", () => {
  it("parses valid OPML with flat outlines", () => {
    const r = parseOpml(VALID_OPML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.feeds.length).toBe(3);
    expect(r.feeds.map((f) => f.xmlUrl).sort()).toEqual([
      "https://feeds.bbci.co.uk/news/rss.xml",
      "https://techcrunch.com/feed/",
      "https://www.theverge.com/rss/index.xml",
    ]);
  });

  it("extracts all standard attributes", () => {
    const r = parseOpml(VALID_OPML);
    if (!r.ok) throw new Error("expected ok");
    const bbc = r.feeds.find((f) => f.xmlUrl.includes("bbci"));
    expect(bbc?.title).toBe("BBC News");
    expect(bbc?.text).toBe("BBC News");
    expect(bbc?.type).toBe("rss");
    expect(bbc?.htmlUrl).toBe("https://www.bbc.com/news");
    expect(bbc?.language).toBe("en");
  });

  it("extracts non-standard custom attributes", () => {
    const xml = `<?xml version="1.0"?>
      <opml version="2.0"><body>
        <outline xmlUrl="https://example.com/feed" myCustomAttr="hello" />
      </body></opml>`;
    const r = parseOpml(xml);
    if (!r.ok) throw new Error("expected ok");
    expect(r.feeds[0].myCustomAttr).toBe("hello");
  });

  it("returns INVALID_XML for non-XML input", () => {
    const r = parseOpml("not xml at all");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("INVALID_XML");
  });

  it("returns INVALID_XML for missing <opml> root", () => {
    const r = parseOpml(`<?xml version="1.0"?><other><body/></other>`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("INVALID_XML");
  });

  it("returns NO_FEEDS when no outline has xmlUrl", () => {
    const xml = `<?xml version="1.0"?>
      <opml version="2.0"><body>
        <outline text="empty category" />
      </body></opml>`;
    const r = parseOpml(xml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("NO_FEEDS");
  });

  it("returns NO_FEEDS for empty body", () => {
    const r = parseOpml(`<?xml version="1.0"?><opml version="2.0"><body/></opml>`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("NO_FEEDS");
  });

  it("handles empty string", () => {
    const r = parseOpml("");
    expect(r.ok).toBe(false);
  });

  it("handles deeply nested category outlines", () => {
    const xml = `<?xml version="1.0"?>
      <opml version="2.0"><body>
        <outline text="L1">
          <outline text="L2">
            <outline text="L3" xmlUrl="https://example.com/deep" />
          </outline>
        </outline>
      </body></opml>`;
    const r = parseOpml(xml);
    if (!r.ok) throw new Error("expected ok");
    expect(r.feeds.length).toBe(1);
    expect(r.feeds[0].xmlUrl).toBe("https://example.com/deep");
  });
});
