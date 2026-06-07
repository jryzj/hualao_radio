// Detailed inspection of card elements to find what's making it tall.

import { chromium } from "playwright";

const VIEWPORTS = [
  { name: "iPhone SE (landscape)",  width: 667,  height: 375  },
  { name: "MacBook 13\" (1440x900)",width: 1440, height: 900  },
];

async function main() {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();
    try {
      await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      console.log(`[${vp.name}] load failed: ${e.message}`);
      await context.close();
      continue;
    }
    await page.waitForTimeout(2000);

    try {
      await page.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 });
      await page.waitForTimeout(500);
    } catch (_) {}

    const data = await page.evaluate(() => {
      const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
      if (!card) return { error: "no card" };
      const cardRect = card.getBoundingClientRect();
      const cardCS = getComputedStyle(card);

      // Get all direct children of the card grid
      const children = Array.from(card.children).map((el, i) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          i,
          tag: el.tagName,
          cls: (el.className || "").toString().slice(0, 80),
          top: Math.round(r.top - cardRect.top),
          height: Math.round(r.height),
          gridArea: cs.gridArea,
          gridColumnStart: cs.gridColumnStart,
          gridRowStart: cs.gridRowStart,
          marginTop: cs.marginTop,
          marginBottom: cs.marginBottom,
          paddingTop: cs.paddingTop,
          paddingBottom: cs.paddingBottom,
        };
      });

      return {
        card: {
          width: Math.round(cardRect.width),
          height: Math.round(cardRect.height),
          gridTemplateColumns: cardCS.gridTemplateColumns,
          gridTemplateRows: cardCS.gridTemplateRows,
          gap: cardCS.gap,
          rowGap: cardCS.rowGap,
          columnGap: cardCS.columnGap,
          paddingTop: cardCS.paddingTop,
          paddingBottom: cardCS.paddingBottom,
        },
        children,
      };
    });

    console.log(`\n${"=".repeat(100)}`);
    console.log(`[${vp.name}]  card ${data.card.width}x${data.card.height}`);
    console.log(`  grid-template-columns: ${data.card.gridTemplateColumns}`);
    console.log(`  grid-template-rows:    ${data.card.gridTemplateRows}`);
    console.log(`  gap / row-gap:         ${data.card.gap} / ${data.card.rowGap}`);
    console.log(`  padding T/B:           ${data.card.paddingTop} / ${data.card.paddingBottom}`);
    console.log(`  children:`);
    for (const c of data.children) {
      console.log(`    [${c.i}] top=${String(c.top).padStart(4)}  h=${String(c.height).padStart(4)}  area=${c.gridArea}  col-start=${c.gridColumnStart}  row-start=${c.gridRowStart}  mt=${c.marginTop}  pt=${c.paddingTop}`);
    }

    await context.close();
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
