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
  { name: "MacBook 13\"", w: 1440, h: 900 },
  { name: "MacBook 16\"", w: 1728, h: 1117 },
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
      const viz = document.querySelector('[class*="aspect-square"]');
      if (!card || !viz) return null;
      const cr = card.getBoundingClientRect();
      const vr = viz.getBoundingClientRect();
      const cardLeft = cr.left, cardRight = cr.right;
      const cardCenterX = (cardLeft + cardRight) / 2;
      const rightHalfCenterX = cardCenterX + (cardRight - cardLeft) / 4;
      const vizCenterX = (vr.left + vr.right) / 2;
      const hOff = vizCenterX - rightHalfCenterX;
      const vOff = ((vr.top + vr.bottom) / 2) - ((cr.top + cr.bottom) / 2);
      return {
        cardLeft: Math.round(cardLeft),
        cardRight: Math.round(cardRight),
        cardW: Math.round(cr.width),
        rightHalfCenterX: Math.round(rightHalfCenterX * 10) / 10,
        vizLeft: Math.round(vr.left),
        vizRight: Math.round(vr.right),
        vizW: Math.round(vr.width),
        vizCenterX: Math.round(vizCenterX * 10) / 10,
        hOff: Math.round(hOff * 10) / 10,
        vOff: Math.round(vOff * 10) / 10,
      };
    });

    console.log(`\n[${vp.name} ${vp.w}x${vp.h}]`);
    if (!m) { console.log("  (no card/viz)"); continue; }
    console.log(`  card: left=${m.cardLeft} right=${m.cardRight} w=${m.cardW}`);
    console.log(`  right half center X: ${m.rightHalfCenterX}`);
    console.log(`  viz:  left=${m.vizLeft} right=${m.vizRight} w=${m.vizW}  centerX=${m.vizCenterX}`);
    console.log(`  H-off (viz center − right half center): ${m.hOff}px  ${Math.abs(m.hOff) < 1 ? "✓ centered" : "✗ OFF"}`);
    console.log(`  V-off: ${m.vOff}px  ${Math.abs(m.vOff) < 4 ? "✓" : "✗"}`);
  } catch (e) {
    console.log(`[${vp.name}] ERROR: ${e.message}`);
  }
  await ctx.close();
}
await b.close();
