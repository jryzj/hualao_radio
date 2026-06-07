// Fetch the actual CSS from the dev server and check the reset rule.
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
  await page.waitForTimeout(3000);

  // Get ALL stylesheets and their rules
  const cssInfo = await page.evaluate(() => {
    const results = [];
    for (const sheet of document.styleSheets) {
      try {
        const rules = Array.from(sheet.cssRules);
        for (const rule of rules) {
          const text = rule.cssText || "";
          // Look for the universal reset and the pt-6 rule
          if (
            (text.includes("*, *::before, *::after") && text.includes("padding: 0")) ||
            (text.includes("*, ::after, ::before, ::backdrop") && text.includes("padding: 0")) ||
            (text.includes(".pt-6") && text.includes("padding-top"))
          ) {
            const parent = rule.parentRule ? `inside @${rule.parentRule.constructor.name}` : "top-level";
            results.push({
              type: rule.constructor.name,
              parent,
              text: text.slice(0, 250),
            });
          }
          // Also check @layer rules
          if (rule.constructor.name === "CSSLayerBlockRule" || rule.type === 4) {
            const innerRules = Array.from(rule.cssRules || []);
            for (const inner of innerRules) {
              const innerText = inner.cssText || "";
              if (innerText.includes("padding: 0") && innerText.includes("*")) {
                results.push({
                  type: `${rule.constructor.name} > ${inner.constructor.name}`,
                  parent: `layer: ${rule.name}`,
                  text: innerText.slice(0, 300),
                });
              }
              if (innerText.includes(".pt-6") && innerText.includes("padding-top")) {
                results.push({
                  type: `${rule.constructor.name} > ${inner.constructor.name}`,
                  parent: `layer: ${rule.name}`,
                  text: innerText.slice(0, 300),
                });
              }
            }
          }
        }
      } catch (e) {}
    }
    return results;
  });

  console.log("Found relevant CSS rules:");
  for (const r of cssInfo) {
    console.log(`\n[${r.type}] parent: ${r.parent}`);
    console.log(`  ${r.text}`);
  }

  await context.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
