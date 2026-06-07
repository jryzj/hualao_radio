import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 852, height: 393 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 90000 });
await p.waitForTimeout(2500);
try { await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 }); await p.waitForTimeout(500); } catch {}

const m = await p.evaluate(() => {
  const card = document.querySelector('section[aria-label="Radio player"] [class*="card-scanlines"]');
  const textStack = card?.children[2];
  const transport = textStack?.children[3]; // 4th item
  const play = transport?.querySelector('button');
  const vol = transport?.children[1];
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
  return {
    textStackW: textStack?.getBoundingClientRect().width,
    transportW: r(transport),
    playW: r(play),
    volW: r(vol),
  };
});
console.log(JSON.stringify(m, null, 2));
await b.close();
