// Verify the RadioPlayer card layout across viewports.
// Uses Playwright with the system Chrome browser (no browser install needed).

import { chromium } from "playwright";

const VIEWPORTS = [
  { name: "iPhone SE (landscape)",  width: 667,  height: 375  },
  { name: "iPhone 14 Pro (landscape)", width: 852, height: 393 },
  { name: "iPad (landscape)",       width: 1024, height: 768  },
  { name: "MacBook 16\"",           width: 1728, height: 1117 },
  { name: "MacBook 13\" (1440x900)",width: 1440, height: 900  },
  { name: "FullHD 1920x1080",       width: 1920, height: 1080 },
];

async function main() {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  console.log("=".repeat(110));
  console.log("RadioPlayer layout verification — V-centering + designed card height");
  console.log("=".repeat(110));

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    try {
      await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2500);
    } catch (e) {
      console.log(`\n[${vp.name} ${vp.width}x${vp.height}] FAILED to load: ${e.message}`);
      await context.close();
      continue;
    }

    // Dismiss the EnterOverlay if present
    try {
      await page.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 });
      await page.waitForTimeout(500);
    } catch (_) { /* overlay may not be visible */ }

    // Measure: viewport, main, section, card
    const measurements = await page.evaluate(() => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const main = document.querySelector("main");
      const section = document.querySelector('section[aria-label="Radio player"]');
      // The card is the only grid child of the section
      const card = section ? section.querySelector('[class*="grid-cols"]') : null;
      const visualizer = document.querySelector('[class*="aspect-square"]');

      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
          centerY: Math.round(r.top + r.height / 2),
          // computed grid template
          gridCols: cs.gridTemplateColumns,
          display: cs.display,
          alignItems: cs.alignItems,
          justifyContent: cs.justifyContent,
          minHeight: cs.minHeight,
        };
      };

      return {
        viewport: { width: vw, height: vh, centerY: vh / 2 },
        main: rect(main),
        section: rect(section),
        card: rect(card),
        visualizer: rect(visualizer),
      };
    });

    const m = measurements;
    const cardCenter = m.card ? m.card.centerY : null;
    const viewportCenter = m.viewport.centerY;
    const vCenterOffset = cardCenter !== null ? Math.abs(cardCenter - viewportCenter) : null;

    // V-centering tolerance: within 4px of viewport center is "centered"
    const vCentered = vCenterOffset !== null && vCenterOffset < 4;

    // Card height "designed" check: should be at least 200px on phone
    // landscape, at least 440px on desktop
    const isDesktop = vp.width >= 1024;
    const isShortLandscape = vp.width < 1024;
    const minExpected = isDesktop ? 440 : (vp.height <= 420 ? 200 : 220);
    const heightOK = m.card && m.card.height >= minExpected;

    // Visualizer visibility check
    const vizVisible = m.visualizer && m.visualizer.width > 100 && m.visualizer.height > 100;

    console.log(`\n[${vp.name}]  viewport ${vp.width}x${vp.height}`);
    console.log(`  main   : ${m.main ? `${m.main.width}x${m.main.height}  top=${m.main.top}  display=${m.main.display} align=${m.main.alignItems}` : "MISSING"}`);
    console.log(`  section: ${m.section ? `${m.section.width}x${m.section.height}  top=${m.section.top}` : "MISSING"}`);
    console.log(`  card   : ${m.card ? `${m.card.width}x${m.card.height}  top=${m.card.top}  centerY=${m.card.centerY}` : "MISSING"}`);
    console.log(`           gridCols=[${m.card?.gridCols}]  minH=${m.card?.minHeight}  align=${m.card?.alignItems}`);
    console.log(`  visual : ${m.visualizer ? `${m.visualizer.width}x${m.visualizer.height}  top=${m.visualizer.top}` : "MISSING"}`);
    console.log(`  VIEWPORT CENTER Y = ${viewportCenter.toFixed(0)}`);
    console.log(`  CARD CENTER Y     = ${cardCenter}`);
    console.log(`  V-center offset   = ${vCenterOffset?.toFixed(1)}px   ${vCentered ? "✓ CENTERED" : "✗ NOT CENTERED"}`);
    console.log(`  Card height       = ${m.card?.height}px  (expected >= ${minExpected})  ${heightOK ? "✓" : "✗ TOO SHORT"}`);
    console.log(`  Visualizer size   = ${m.visualizer?.width}x${m.visualizer?.height}  ${vizVisible ? "✓ VISIBLE" : "✗ INVISIBLE/COLLAPSED"}`);

    await context.close();
  }

  await browser.close();
  console.log("\n" + "=".repeat(110));
  console.log("Done.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
