import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
try {
  await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 });
  await p.waitForTimeout(500);
} catch (_) {}
const data = await p.evaluate(() => {
  const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
  // The visualizer wrapper is the grid child that contains an
  // aspect-square child. Find it by looking for the inner div.
  const inner = card?.querySelector(':scope > div > div.aspect-square');
  // The wrapper is the parent of the inner div
  const wrapper = inner?.parentElement;
  // The AudioViz is the inner div's child
  const audioViz = inner?.querySelector('div');

  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      top: Math.round(r.top * 100) / 100,
      left: Math.round(r.left * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      centerY: Math.round((r.top + r.height / 2) * 100) / 100,
      display: cs.display,
      alignItems: cs.alignItems,
      alignSelf: cs.alignSelf,
      height_css: cs.height,
      minHeight: cs.minHeight,
      maxHeight: cs.maxHeight,
      gridColumnStart: cs.gridColumnStart,
      gridColumnEnd: cs.gridColumnEnd,
      gridRowStart: cs.gridRowStart,
      gridRowEnd: cs.gridRowEnd,
    };
  };

  return {
    card: rect(card),
    wrapper: rect(wrapper),
    inner: rect(inner),
    audioViz: rect(audioViz),
    wrapperClass: wrapper?.className?.slice(0, 300),
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
