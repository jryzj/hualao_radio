import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 667, height: 375 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 90000 });
await p.waitForTimeout(2500);
try { await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 }); await p.waitForTimeout(500); } catch {}

const m = await p.evaluate(() => {
  const card = document.querySelector('section[aria-label="Radio player"] [class*="card-scanlines"]');
  const textStack = card?.children[2];
  const items = Array.from(textStack?.children || []).map((el, i) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      i,
      tag: el.tagName,
      h: Math.round(r.height),
      mt: cs.marginTop, pt: cs.paddingTop, bt: cs.borderTopWidth,
      cls: el.className?.toString().slice(0, 100),
    };
  });
  return { cardH: card.getBoundingClientRect().height, textStackH: textStack?.getBoundingClientRect().height, items };
});
console.log(JSON.stringify(m, null, 2));
await b.close();
