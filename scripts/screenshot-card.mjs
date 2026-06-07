import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const viewports = [
  { name: "iPhone-SE-landscape", w: 667, h: 375 },
  { name: "iPhone-14-Pro-landscape", w: 852, h: 393 },
  { name: "iPad-landscape", w: 1024, h: 768 },
  { name: "MacBook-13", w: 1440, h: 900 },
];
for (const vp of viewports) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 90000 });
  await p.waitForTimeout(2500);
  try { await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 }); await p.waitForTimeout(500); } catch {}
  await p.screenshot({ path: `scripts/card-${vp.name}.png` });
  console.log(`Saved: scripts/card-${vp.name}.png`);
  await ctx.close();
}
await b.close();
