// Deep inspection: dump all matched CSS rules on the card, list every
// rule that mentions "padding" or "padding-top", and show the element's
// inline style attribute and the entire className string.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const page = await context.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  try {
    await page.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 });
    await page.waitForTimeout(500);
  } catch (_) {}

  const data = await page.evaluate(() => {
    const out = {};
    const section = document.querySelector('section[aria-label="Radio player"]');
    out.sectionClassName = section ? section.className : null;
    out.sectionInlineStyle = section ? section.getAttribute("style") : null;

    // Find the actual card div (the one with grid-cols classes)
    const card = document.querySelector('section[aria-label="Radio player"] [class*="grid-cols"]');
    if (card) {
      out.cardClassName = card.className;
      out.cardInlineStyle = card.getAttribute("style");
      const cs = getComputedStyle(card);
      out.cardComputed = {
        padding: cs.padding,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        display: cs.display,
        gap: cs.gap,
        maxWidth: cs.maxWidth,
        minHeight: cs.minHeight,
        height: cs.height,
        boxSizing: cs.boxSizing,
      };

      // Find all CSS rules from all sheets that match the card
      const matching = [];
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch (e) { continue; }
        if (!rules) continue;
        for (const rule of rules) {
          try {
            if (!rule.selectorText) continue;
            // Check if the rule's selector matches the card
            if (card.matches(rule.selectorText)) {
              const isInLayer = rule.parentRule ? `inside @${rule.parentRule.constructor.name} ("${rule.parentRule.name || "anonymous"}")` : "top-level";
              matching.push({
                selector: rule.selectorText,
                inLayer: isInLayer,
                cssText: rule.cssText.slice(0, 400),
              });
            }
            // Layer block
            if (rule.type === 4 || rule.constructor.name === "CSSLayerBlockRule") {
              const inner = rule.cssRules || [];
              for (const i of inner) {
                try {
                  if (i.selectorText && card.matches(i.selectorText)) {
                    matching.push({
                      selector: i.selectorText,
                      inLayer: `inside @layer ${rule.name} > ${i.constructor.name}`,
                      cssText: i.cssText.slice(0, 400),
                    });
                  }
                } catch (e) {}
              }
            }
          } catch (e) {}
        }
      }
      out.matchingRules = matching.filter(m => m.cssText.match(/padding|p-?[xytrbl]?-/));
    }

    // Also: the rule that touches padding-top on .pt-6 — where is it?
    const pt6Locations = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const rule of rules) {
        if (rule.cssText && rule.cssText.includes(".pt-6") && rule.cssText.includes("padding-top")) {
          pt6Locations.push({
            inLayer: rule.parentRule ? `@${rule.parentRule.constructor.name} "${rule.parentRule.name || "anon"}"` : "top-level",
            cssText: rule.cssText.slice(0, 200),
          });
        }
      }
    }
    out.pt6Locations = pt6Locations;

    return out;
  });

  console.log("=== SECTION ===");
  console.log("className:", data.sectionClassName?.slice(0, 500));
  console.log("inline style:", data.sectionInlineStyle);
  console.log("\n=== CARD ===");
  console.log("className:", data.cardClassName?.slice(0, 1500));
  console.log("inline style:", data.cardInlineStyle);
  console.log("computed:", JSON.stringify(data.cardComputed, null, 2));

  console.log("\n=== MATCHING PADDING RULES ON CARD ===");
  if (data.matchingRules && data.matchingRules.length) {
    for (const m of data.matchingRules) {
      console.log(`\n[${m.inLayer}]`);
      console.log(`  selector: ${m.selector}`);
      console.log(`  css: ${m.cssText}`);
    }
  } else {
    console.log("(no padding-related matching rules found!)");
  }

  console.log("\n=== .pt-6 RULE LOCATIONS IN STYLESHEETS ===");
  for (const loc of data.pt6Locations) {
    console.log(`[${loc.inLayer}]`);
    console.log(`  ${loc.cssText}`);
  }

  await context.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
