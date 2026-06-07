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
      const cs = getComputedStyle(card);
      const cr = card.getBoundingClientRect();
      const vr = viz.getBoundingClientRect();
      const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
      const cardLeft = cr.left, cardRight = cr.right;
      const cardCenterX = (cardLeft + cardRight) / 2;
      const contentLeft = cardLeft + padL, contentRight = cardRight - padR;
      const contentCenterX = (contentLeft + contentRight) / 2;
      const contentRightHalfCenterX = contentCenterX + (contentRight - contentLeft) / 4;
      const borderRightHalfCenterX = cardCenterX + (cardRight - cardLeft) / 4;
      const vizCenterX = (vr.left + vr.right) / 2;
      return {
        padL: Math.round(padL), padR: Math.round(padR),
        cardW: Math.round(cr.width),
        contentW: Math.round(contentRight - contentLeft),
        borderRightHalfCenter: Math.round(borderRightHalfCenterX * 10) / 10,
        contentRightHalfCenter: Math.round(contentRightHalfCenterX * 10) / 10,
        vizCenterX: Math.round(vizCenterX * 10) / 10,
        hOffBorder: Math.round((vizCenterX - borderRightHalfCenterX) * 10) / 10,
        hOffContent: Math.round((vizCenterX - contentRightHalfCenterX) * 10) / 10,
      };
    });

    console.log(`\n[${vp.name} ${vp.w}x${vp.h}]  cardW=${m.cardW}  padL=${m.padL} padR=${m.padR}  contentW=${m.contentW}`);
    console.log(`  right-half center (border box): ${m.borderRightHalfCenter}`);
    console.log(`  right-half center (content box): ${m.contentRightHalfCenter}`);
    console.log(`  viz center: ${m.vizCenterX}`);
    console.log(`  H-off vs border-box right half: ${m.hOffBorder}px  ${Math.abs(m.hOffBorder) < 1 ? "✓" : "✗"}`);
    console.log(`  H-off vs content-box right half: ${m.hOffContent}px  ${Math.abs(m.hOffContent) < 1 ? "✓ centered in content right-half" : "✗"}`);
  } catch (e) {
    console.log(`[${vp.name}] ERROR: ${e.message}`);
  }
  await ctx.close();
}
await b.close();
