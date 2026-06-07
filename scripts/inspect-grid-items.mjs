import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 90000 });
await p.waitForTimeout(3000);
try { await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 }); await p.waitForTimeout(500); } catch {}

const data = await p.evaluate(() => {
  const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
  const cardR = card.getBoundingClientRect();
  const children = Array.from(card.children).map((c, i) => {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    const text = c.textContent.trim().slice(0, 30);
    return {
      idx: i,
      tag: c.tagName,
      text,
      col: cs.gridColumnStart + "/" + cs.gridColumnEnd,
      row: cs.gridRowStart + "/" + cs.gridRowEnd,
      x: Math.round(r.left - cardR.left),
      y: Math.round(r.top - cardR.top),
      w: Math.round(r.width), h: Math.round(r.height),
    };
  });
  return { cardW: Math.round(cardR.width), cardH: Math.round(cardR.height), children };
});
console.log(JSON.stringify(data, null, 2));
await b.close();
