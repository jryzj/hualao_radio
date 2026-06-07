// Check computed padding on card vs pill, and check the global reset.
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
    const onAirPill = card?.querySelector('[role="status"]');
    const section = document.querySelector('section[aria-label="Radio player"]');

    const checkEl = (el, name) => {
      if (!el) return { name, exists: false };
      const cs = getComputedStyle(el);
      return {
        name,
        exists: true,
        padding: cs.padding,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        height: Math.round(el.getBoundingClientRect().height),
        clientHeight: el.clientHeight,
        offsetHeight: el.offsetHeight,
        // Use window.getMatchedCSSRules-style inspection
        boxSizing: cs.boxSizing,
        // Check if the element matches the global reset selector
      };
    };

    // Check if the global reset rule exists and is un-layered
    let resetRule = "NOT FOUND";
    let resetInLayer = "unknown";
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.cssText && rule.cssText.includes("*") && rule.cssText.includes("padding: 0") && rule.cssText.includes("box-sizing")) {
            resetRule = rule.cssText.slice(0, 200);
            // Check parent rule
            resetInLayer = rule.parentRule ? rule.parentRule.cssText.slice(0, 100) : "un-layered (top-level)";
            break;
          }
        }
      } catch (e) {}
      if (resetRule !== "NOT FOUND") break;
    }

    // Also check the pt-6 rule
    let pt6Rule = "NOT FOUND";
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.cssText && rule.cssText.includes(".pt-6") && rule.cssText.includes("padding-top")) {
            pt6Rule = rule.cssText.slice(0, 200);
            break;
          }
        }
      } catch (e) {}
      if (pt6Rule !== "NOT FOUND") break;
    }

    // Check the landscape-shorter:pt-3.5 rule
    let lsPtRule = "NOT FOUND";
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.cssText && rule.cssText.includes("landscape-shorter") && rule.cssText.includes("pt-3.5")) {
            lsPtRule = rule.cssText.slice(0, 300);
            break;
          }
        }
      } catch (e) {}
      if (lsPtRule !== "NOT FOUND") break;
    }

    return {
      card: checkEl(card, "card"),
      section: checkEl(section, "section"),
      onAirPill: checkEl(onAirPill, "onAirPill"),
      resetRule,
      resetInLayer,
      pt6Rule,
      lsPtRule,
    };
  });

  console.log("=== ELEMENT PADDING ===");
  console.log(JSON.stringify(data.card, null, 2));
  console.log(JSON.stringify(data.section, null, 2));
  console.log(JSON.stringify(data.onAirPill, null, 2));

  console.log("\n=== GLOBAL RESET RULE ===");
  console.log(data.resetRule);
  console.log("Parent rule:", data.resetInLayer);

  console.log("\n=== pt-6 RULE ===");
  console.log(data.pt6Rule);

  console.log("\n=== landscape-shorter:pt-3.5 RULE ===");
  console.log(data.lsPtRule);

  await context.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
