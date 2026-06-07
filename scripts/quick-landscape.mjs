import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});

const viewports = [
  { name: "iPhone SE (landscape)", w: 667, h: 375 },
  { name: "iPhone 14 Pro (landscape)", w: 852, h: 393 },
  { name: "iPad (landscape)", w: 1024, h: 768 },
  { name: "MacBook 16\"", w: 1728, h: 1117 },
  { name: "MacBook 13\"", w: 1440, h: 900 },
  { name: "FullHD", w: 1920, h: 1080 },
];

for (const vp of viewports) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
  const p = await ctx.newPage();
  try {
    await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 90000 });
    await p.waitForTimeout(2500);
    try { await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 }); await p.waitForTimeout(500); } catch {}
    const m = await p.evaluate(() => {
      const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
      const cardCS = card ? getComputedStyle(card) : null;
      const viz  = document.querySelector('[class*="aspect-square"]');
      const telem = document.querySelector(".telemetry-strip");
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }; };
      return {
        vh: window.innerHeight, scrollH: document.documentElement.scrollHeight,
        card: r(card), cols: cardCS?.gridTemplateColumns,
        viz: r(viz), telem: r(telem),
      };
    });
    console.log(`\n[${vp.name} ${vp.w}x${vp.h}]  vh=${m.vh} scrollH=${m.scrollH}`);
    console.log(`  card: ${m.card?.width}x${m.card?.height} top=${m.card?.top}  cols=[${m.cols}]`);
    console.log(`  viz : ${m.viz?.width}x${m.viz?.height}  ${m.viz && m.viz.width>50 ? "✓" : "✗ HIDDEN"}`);
    console.log(`  telem: ${m.telem?.width}x${m.telem?.height} top=${m.telem?.top}  ${m.telem && m.telem.height>0 ? "✓" : "✗"}`);
  } catch (e) {
    console.log(`[${vp.name}] ERROR: ${e.message}`);
  }
  await ctx.close();
}
await b.close();
