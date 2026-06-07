// Test: set card max-h-[600px] overflow-hidden and see if content clips
// on MacBook 13" (the failing viewport).
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

// Inject CSS to cap card height
await p.addStyleTag({ content: `
  [aria-label="Radio player"] [class*="grid-cols"] {
    max-height: 600px !important;
    overflow: hidden !important;
  }
` });
await p.waitForTimeout(500);

const data = await p.evaluate(() => {
  const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
  const cs = getComputedStyle(card);
  const cardR = card.getBoundingClientRect();
  const children = Array.from(card.children).map((c, i) => {
    const r = c.getBoundingClientRect();
    const cs2 = getComputedStyle(c);
    const text = c.textContent.trim().slice(0, 30);
    return {
      idx: i, text,
      y: Math.round(r.top - cardR.top),
      h: Math.round(r.height),
      clip: r.bottom > cardR.bottom + 0.5 || r.top < cardR.top - 0.5,
    };
  });
  return { cardH: Math.round(cardR.height), maxH: cs.maxHeight, children };
});
console.log(JSON.stringify(data, null, 2));
await b.close();
