import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});

const viewports = [
  { name: "iPhone SE", w: 667, h: 375 },
  { name: "iPhone 14 Pro", w: 852, h: 393 },
  { name: "iPad", w: 1024, h: 768 },
  { name: "MacBook 13", w: 1440, h: 900 },
];

for (const vp of viewports) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 90000 });
  await p.waitForTimeout(2500);
  try { await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 }); await p.waitForTimeout(500); } catch {}

  const m = await p.evaluate(() => {
    const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
    const vizWrap = card.lastElementChild;
    const vizInner = vizWrap?.firstElementChild;
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) }; };
    const cs = (el) => { if (!el) return null; const s = getComputedStyle(el); return { padL: s.paddingLeft, padR: s.paddingRight, width: s.width }; };
    return {
      cardR: r(card),
      cardCS: { padL: getComputedStyle(card).paddingLeft, padR: getComputedStyle(card).paddingRight },
      wrapR: r(vizWrap),
      wrapCS: cs(vizWrap),
      innerR: r(vizInner),
    };
  });
  console.log(`\n[${vp.name} ${vp.w}x${vp.h}]`);
  console.log(`  card: x=${m.cardR.left}-${m.cardR.right} w=${m.cardR.w}  padL=${m.cardCS.padL} padR=${m.cardCS.padR}`);
  console.log(`  wrap: x=${m.wrapR.left}-${m.wrapR.right} w=${m.wrapR.w}  padL=${m.wrapCS.padL} padR=${m.wrapCS.padR}`);
  console.log(`  inner: x=${m.innerR.left}-${m.innerR.right} w=${m.innerR.w}  center=${(m.innerR.left+m.innerR.right)/2}`);
  await ctx.close();
}
await b.close();
