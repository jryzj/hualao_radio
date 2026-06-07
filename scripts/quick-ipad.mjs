import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 1024, height: 1366 } });
const p = await ctx.newPage();
try {
  await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 90000 });
  await p.waitForTimeout(3000);
  try { await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 }); await p.waitForTimeout(500); } catch {}
  const m = await p.evaluate(() => {
    const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
    const cardGrid = card ? getComputedStyle(card) : null;
    // The visualizer wrapper is the row-span-full element
    const vizWrapper = document.querySelector('[class*="row-span-full"]');
    const viz  = document.querySelector('[class*="aspect-square"]');
    const telem = document.querySelector(".telemetry-strip");
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }; };
    return {
      vh: window.innerHeight, scrollHeight: document.documentElement.scrollHeight,
      card: r(card), cardGridCols: cardGrid?.gridTemplateColumns,
      vizWrapper: r(vizWrapper), viz: r(viz), telem: r(telem),
    };
  });
  console.log("iPad 1024x1366 (portrait):");
  console.log("  scrollHeight:", m.scrollHeight, "  vh:", m.vh);
  console.log("  card:", JSON.stringify(m.card), "  cols:", m.cardGridCols);
  console.log("  vizWrapper:", JSON.stringify(m.vizWrapper));
  console.log("  visual:", JSON.stringify(m.viz));
  console.log("  telem:", JSON.stringify(m.telem));
} catch (e) {
  console.log("ERROR:", e.message);
}
await b.close();
