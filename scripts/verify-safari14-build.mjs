import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import * as acorn from "acorn";

const nextDir = join(process.cwd(), ".next");
const chunksDir = join(nextDir, "static", "chunks");
const appDir = join(nextDir, "server", "app");

const cssBlockers = /lab\(|color-mix|dvh|svh|lvh|@layer|@property/;
const jsBlockers = /static\{|\?\?=|\|\|=|&&=/;

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of await readdir(chunksDir)) {
  if (!file.endsWith(".css") && !file.endsWith(".js")) continue;
  const path = join(chunksDir, file);
  const text = await readFile(path, "utf8");

  if (file.endsWith(".css")) {
    assert(!cssBlockers.test(text), `${file}: Safari 14 CSS blocker found`);
  }

  if (file.endsWith(".js")) {
    assert(!jsBlockers.test(text), `${file}: Safari 14 JS syntax blocker found`);
    acorn.parse(text, { ecmaVersion: 2020, sourceType: "script" });
  }
}

for (const file of await listFiles(appDir)) {
  if (!file.endsWith(".html")) continue;
  const html = await readFile(file, "utf8");
  const headStart = html.indexOf("<head>");
  if (headStart === -1) continue;

  const guard = html.indexOf('id="radioai-legacy-runtime-guards"');
  const firstChunk = html.indexOf('/_next/static/chunks/');

  assert(guard !== -1, `${file}: missing radioai legacy runtime guard`);
  assert(firstChunk === -1 || guard < firstChunk, `${file}: legacy runtime guard is after app chunks`);
  assert(html.includes("URL.canParse"), `${file}: missing URL.canParse polyfill`);
  assert(html.includes("pointer-events:none"), `${file}: runtime error overlay may intercept taps`);
}

console.log("Safari 14 build verification passed");
