import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 393, height: 852 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 90000 });
await p.waitForTimeout(3000);
try { await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 }); await p.waitForTimeout(500); } catch {}
const m = await p.evaluate(() => {
  const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
  const cs = getComputedStyle(card);
  const viz  = document.querySelector('[class*="aspect-square"]');
  const telem = document.querySelector(".telemetry-strip");
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }; };
  return {
    vh: window.innerHeight, scrollH: document.documentElement.scrollHeight,
    card: r(card), cols: cs.gridTemplateColumns,
    viz: r(viz), telem: r(telem),
  };
});
console.log("iPhone 14 Pro 393x852 (portrait):");
console.log(`  vh=${m.vh} scrollH=${m.scrollH}`);
console.log(`  card: ${m.card?.width}x${m.card?.height}  cols=[${m.cols}]`);
console.log(`  viz : ${m.viz?.width}x${m.viz?.height}  ${m.viz && m.viz.width>50 ? "✓" : "✗"}`);
console.log(`  telem: ${m.telem?.width}x${m.telem?.height} top=${m.telem?.top}  ${m.telem && m.telem.height>0 ? "✓" : "✗"}`);
await b.close();
