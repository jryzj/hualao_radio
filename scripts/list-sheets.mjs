import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 667, height: 375 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
const sheets = await p.evaluate(() =>
  Array.from(document.styleSheets).map(s => ({
    href: s.href,
    owner: s.ownerNode?.tagName + (s.ownerNode?.id ? "#" + s.ownerNode.id : "") + (s.ownerNode?.getAttribute("data-href") ? " data-href=" + s.ownerNode.getAttribute("data-href") : ""),
    ruleCount: (() => { try { return s.cssRules.length; } catch { return "BLOCKED"; } })(),
  }))
);
console.log(JSON.stringify(sheets, null, 2));
await browser.close();
