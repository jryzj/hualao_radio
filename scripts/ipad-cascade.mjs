import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 1024, height: 1366 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 90000 });
await p.waitForTimeout(3000);
try { await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 }); await p.waitForTimeout(500); } catch {}

const data = await p.evaluate(() => {
  const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
  const cs = getComputedStyle(card);
  // Find matching CSS rules
  const matched = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.type === 4) { // CSSMediaRule
          if (rule.conditionText.includes("landscape") || rule.conditionText.includes("orientation")) {
            matched.push({ media: rule.conditionText, selector: rule.cssRules[0]?.selectorText?.slice(0, 80) });
          }
        }
        if (rule.selectorText && rule.selectorText.includes("grid-cols-")) {
          matched.push({ selector: rule.selectorText.slice(0, 120), media: "(none)" });
        }
      }
    } catch {}
  }
  return {
    gridCols: cs.gridTemplateColumns,
    isLandscape: window.matchMedia("(orientation: landscape)").matches,
    isPortrait: window.matchMedia("(orientation: portrait)").matches,
    isWide: window.matchMedia("(min-width: 1024px)").matches,
    screenWidth: screen.width, screenHeight: screen.height,
    matched: matched.slice(0, 20),
  };
});
console.log(JSON.stringify(data, null, 2));
await b.close();
