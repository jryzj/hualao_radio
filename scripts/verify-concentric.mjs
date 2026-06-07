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

// Click play
try { await p.locator('button[aria-label*="playback"]').click({ timeout: 2000 }); await p.waitForTimeout(2000); } catch {}

const m = await p.evaluate(() => {
  const viz = document.querySelector('[class*="aspect-square"]');
  if (!viz) return null;
  const r = viz.getBoundingClientRect();
  const cs = getComputedStyle(viz);
  const svgRings = viz.querySelectorAll("svg circle, svg [r]");
  const rings = [];
  svgRings.forEach(el => {
    const rr = el.getBoundingClientRect();
    rings.push({ cx: Math.round(rr.left + rr.width / 2 - r.left), cy: Math.round(rr.top + rr.height / 2 - r.top), r: Math.round(rr.width / 2) });
  });
  // Also check FFT bars
  const bars = viz.querySelectorAll("[class*='bar'], rect, [style*='height']");
  return {
    viz: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), aspect: cs.aspectRatio },
    rings: rings.slice(0, 10),
    nRings: rings.length,
    nBars: bars.length,
  };
});
console.log(JSON.stringify(m, null, 2));

// Screenshot for visual inspection
await p.screenshot({ path: "scripts/verify-layout-1440x900.png", fullPage: false });
console.log("Screenshot saved: scripts/verify-layout-1440x900.png");
await b.close();
