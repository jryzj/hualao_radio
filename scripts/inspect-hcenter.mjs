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
  const section = document.querySelector('section[aria-label="Radio player"]');
  const card = section?.querySelector('[class*="grid-cols"]');
  if (!card) return { err: "no card" };
  // The visualizer wrapper is the last direct child of the card
  // and has className containing "wide:absolute" and "wide:border-l"
  const vizWrap = card.lastElementChild;
  const vizInner = vizWrap?.firstElementChild;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
  const cs = (el) => { if (!el) return null; const s = getComputedStyle(el); return { position: s.position, left: s.left, right: s.right, top: s.top, bottom: s.bottom, display: s.display, paddingLeft: s.paddingLeft, paddingRight: s.paddingRight, width: s.width, maxWidth: s.maxWidth, transform: s.transform, gridColumnStart: s.gridColumnStart, gridRowStart: s.gridRowStart }; };
  return {
    cardChildrenCount: card.children.length,
    cardChildrenClasses: Array.from(card.children).map(c => c.className.toString().slice(0, 60)),
    cardR: r(card),
    cardCS: cs(card),
    vizWrapTag: vizWrap?.tagName,
    vizWrapClass: vizWrap?.className.toString(),
    vizWrapCS: cs(vizWrap),
    vizWrapR: r(vizWrap),
    vizInnerR: r(vizInner),
    vizInnerCS: cs(vizInner),
    vh: window.innerHeight,
    docW: document.documentElement.clientWidth,
  };
});
console.log(JSON.stringify(m, null, 2));
await b.close();
