import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 90000 });
await p.waitForTimeout(3000);
try { await p.locator('button:has-text("TAP TO ENTER")').click({ timeout: 2000 }); await p.waitForTimeout(500); } catch {}

const m = await p.evaluate(() => {
  const page = document.querySelector(".listen-page, [class*='flex min-h-']") || document.querySelector(".flex.min-h-\\[100dvh\\]");
  const main = document.querySelector("main");
  const card = document.querySelector('section[aria-label="Radio player"] > [data-playing], section[aria-label="Radio player"] > div');
  const fab = document.querySelector('[class*="fab-stack"], [class*="fixed"][class*="bottom-"]');
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height), width: Math.round(b.width) }; };
  const list = (root) => {
    const out = [];
    if (!root) return out;
    for (const child of root.children) {
      const b = child.getBoundingClientRect();
      const cs = getComputedStyle(child);
      out.push({
        tag: child.tagName,
        cls: child.className?.toString().slice(0, 80),
        top: Math.round(b.top), bottom: Math.round(b.bottom),
        height: Math.round(b.height), width: Math.round(b.width),
        pos: cs.position,
      });
    }
    return out;
  };
  return {
    vh: window.innerHeight,
    body: r(document.body),
    page: r(page),
    main: r(main),
    card: r(card),
    fab: r(fab),
    pageChildren: list(page),
    mainChildren: list(main),
  };
});
console.log(JSON.stringify(m, null, 2));
await b.close();
