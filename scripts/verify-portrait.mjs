// Verify portrait layout is unchanged (regression check for the
// "remove overflow-hidden + max-h" change).
import { chromium } from "playwright";

const VIEWPORTS = [
  { name: "iPhone SE (portrait)",   width: 375,  height: 667  },
  { name: "iPhone 14 Pro (portrait)", width: 393, height: 852 },
  { name: "iPad (portrait)",        width: 1024, height: 1366 },
];

async function main() {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const p = await ctx.newPage();
    try {
      await p.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForTimeout(2500);
    } catch (e) {
      console.log(`[${vp.name}] FAILED to load: ${e.message}`);
      await ctx.close(); continue;
    }
    try {
      await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 });
      await p.waitForTimeout(500);
    } catch (_) {}

    const m = await p.evaluate(() => {
      const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
      const viz  = document.querySelector('[class*="aspect-square"]');
      const onAir = Array.from(document.querySelectorAll("div")).find(el => el.textContent.trim() === "ON AIR");
      const telemetry = document.querySelector(".telemetry-strip");
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }; };
      return {
        vh: window.innerHeight,
        card: r(card),
        viz: r(viz),
        onAir: r(onAir),
        telemetry: r(telemetry),
      };
    });

    // Card must fit in viewport (top >= 0 and bottom <= vh)
    const cardFits = m.card && m.card.top >= 0 && m.card.bottom <= m.vh;
    // Visualizer must be visible
    const vizVisible = m.viz && m.viz.width > 100 && m.viz.height > 100;
    // All 7 elements must be present (any non-null rect)
    const allPresent = !!(m.card && m.viz && m.onAir && m.telemetry);

    console.log(`\n[${vp.name}]  viewport ${vp.width}x${m.vh}`);
    console.log(`  card   : ${m.card ? `${m.card.width}x${m.card.height}  top=${m.card.top}  bottom=${m.card.bottom}` : "MISSING"}  ${cardFits ? "✓ FITS" : "✗ OVERFLOWS"}`);
    console.log(`  visual : ${m.viz ? `${m.viz.width}x${m.viz.height}  top=${m.viz.top}` : "MISSING"}  ${vizVisible ? "✓ VISIBLE" : "✗ HIDDEN"}`);
    console.log(`  on-air : ${m.onAir ? `${m.onAir.width}x${m.onAir.height}  top=${m.onAir.top}` : "MISSING"}`);
    console.log(`  telem  : ${m.telemetry ? `${m.telemetry.width}x${m.telemetry.height}  top=${m.telemetry.top}` : "MISSING"}`);
    console.log(`  All elements present: ${allPresent ? "✓" : "✗"}`);
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
