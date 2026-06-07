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
      const card = document.querySelector('section[aria-label="Radio player"] [class*="card-scanlines"]');
      // Children: [0]=corner-ticks [1]=ON AIR [2]=text-stack [3]=visualizer
      const onAir = card?.children[1];
      const textStack = card?.children[2];
      const visualizerWrap = card?.children[3];
      const telem = card?.querySelector(".telemetry-strip");
      const viz = card?.querySelector('[class*="aspect-square"]');
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }; };
      const cardR = r(card);
      const tsR = r(textStack);
      const oaR = r(onAir);
      const tmR = r(telem);
      const vR = r(viz);
      const vwR = r(visualizerWrap);
      return {
        vh: window.innerHeight,
        card: cardR,
        textStack: tsR,
        onAir: oaR,
        telem: tmR,
        viz: vR,
        visualizerWrap: vwR,
        textStackHeight: tsR?.height,
        textStackFitsInCard: tsR && cardR ? (tsR.bottom <= cardR.bottom && tsR.top >= cardR.top) : null,
        gapTop: tsR && cardR ? Math.round(tsR.top - cardR.top) : null,
        gapBottom: tsR && cardR ? Math.round(cardR.bottom - tsR.bottom) : null,
        vizCenterY: vR ? Math.round(vR.top + vR.height / 2) : null,
        cardCenterY: cardR ? Math.round(cardR.top + cardR.height / 2) : null,
        vizOffsetFromCenter: vR && cardR ? Math.round((vR.top + vR.height / 2) - (cardR.top + cardR.height / 2)) : null,
      };
    });
    console.log(`\n[${vp.name} ${vp.w}x${vp.h}]`);
    console.log(`  card: ${m.card?.width}x${m.card?.height} top=${m.card?.top} bottom=${m.card?.bottom}  cy=${m.cardCenterY}`);
    console.log(`  onAir: ${m.onAir?.width}x${m.onAir?.height} top=${m.onAir?.top}`);
    console.log(`  textStack: ${m.textStack?.width}x${m.textStack?.height} top=${m.textStack?.top} bottom=${m.textStack?.bottom}`);
    console.log(`  viz: ${m.viz?.width}x${m.viz?.height} top=${m.viz?.top}  cy=${m.vizCenterY}  off=${m.vizOffsetFromCenter}`);
    console.log(`  visualizerWrap: ${m.visualizerWrap?.width}x${m.visualizerWrap?.height} top=${m.visualizerWrap?.top} bottom=${m.visualizerWrap?.bottom}`);
    console.log(`  telem: ${m.telem?.width}x${m.telem?.height} top=${m.telem?.top}`);
    console.log(`  textStack fits in card: ${m.textStackFitsInCard}  gap-top=${m.gapTop}  gap-bottom=${m.gapBottom}`);
  } catch (e) {
    console.log(`[${vp.name}] ERROR: ${e.message}`);
  }
  await ctx.close();
}
await b.close();
