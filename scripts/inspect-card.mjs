// Debug: check the actual className and computed styles of the card.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 667, height: 375 },
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  try {
    await page.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 });
    await page.waitForTimeout(500);
  } catch (_) {}

  const data = await page.evaluate(() => {
    const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
    if (!card) return { error: "no card" };
    const cs = getComputedStyle(card);
    return {
      className: card.className,
      padding: cs.padding,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      gap: cs.gap,
      rowGap: cs.rowGap,
      width: cs.width,
      height: cs.height,
      display: cs.display,
      // Check if landscape-shorter rules are in the stylesheet
      landscapeShorterRule: (() => {
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule.cssText && rule.cssText.includes("landscape-shorter") && rule.cssText.includes("pt-3")) {
                return rule.cssText;
              }
            }
          } catch (e) {}
        }
        return "NOT FOUND";
      })(),
    };
  });

  console.log("Card className:", data.className);
  console.log("\nComputed styles:");
  console.log("  padding:", data.padding);
  console.log("  paddingTop:", data.paddingTop);
  console.log("  paddingBottom:", data.paddingBottom);
  console.log("  paddingLeft:", data.paddingLeft);
  console.log("  paddingRight:", data.paddingRight);
  console.log("  gap:", data.gap);
  console.log("  rowGap:", data.rowGap);
  console.log("  width:", data.width, "height:", data.height);
  console.log("\nlandscape-shorter pt-3 rule:", data.landscapeShorterRule);

  await context.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
