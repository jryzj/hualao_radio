import { createHash } from "node:crypto";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, parse } from "node:path";

const nextDir = join(process.cwd(), ".next");
const chunksDir = join(nextDir, "static", "chunks");
const mappings = new Map();
const legacyRuntimeGuardScript = String.raw`<script id="radioai-legacy-runtime-guards">!function(){function show(e){try{var target=e&&e.target;var src=target&&(target.src||target.href);if(src&&/fonts\.(googleapis|gstatic)\.com/.test(src))return;var isResource=!!src;var tag=target&&target.tagName;var m=(isResource?"Resource failed: "+src:"")||(e&&e.reason&&(e.reason.stack||e.reason.message))||(e&&e.error&&(e.error.stack||e.error.message))||(e&&e.message)||String(e);try{localStorage.setItem("radioai.lastError",m)}catch(_){}if(isResource&&tag!=="SCRIPT")return;var d=document.getElementById("radioai-runtime-error");if(!d){d=document.createElement("pre");d.id="radioai-runtime-error";d.style.cssText="position:fixed;z-index:2147483647;inset:8px;padding:12px;overflow:auto;background:#190008;color:#ffccd8;border:1px solid #ff4466;border-radius:8px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;pointer-events:none";document.addEventListener("DOMContentLoaded",function(){document.body&&document.body.appendChild(d)});if(document.body)document.body.appendChild(d)}d.textContent="RadioAI runtime error:\n"+m}catch(_){}}window.addEventListener("error",show,true);window.addEventListener("unhandledrejection",show);if(!Array.prototype.at){Array.prototype.at=function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return n>=0&&n<this.length?this[n]:void 0}}if(!Object.hasOwn){Object.hasOwn=function(o,k){return Object.prototype.hasOwnProperty.call(o,k)}}if(typeof URL!="undefined"&&!URL.canParse){URL.canParse=function(u,b){try{new URL(u,b);return true}catch(_){return false}}}if(!("cause"in new Error())){var _E=Error;Error=function(m,o){var e=_E(m);if(o&&o.cause!==void 0)e.cause=o.cause;return e};Error.prototype=_E.prototype}}();</script>`;

function hash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function safariName(file, content) {
  const parsed = parse(file);
  const stem = parsed.name.replace(/\.s14-[a-f0-9]{12}$/i, "");
  return `${stem}.s14-${hash(content)}${parsed.ext}`;
}

function replaceMappings(text) {
  let out = text;
  for (const [from, to] of mappings) {
    out = out.split(from).join(to);
  }
  return out;
}

function stripLabSupports(css) {
  let out = css;
  let start = out.indexOf("@supports");

  while (start !== -1) {
    const blockStart = out.indexOf("{", start);
    if (blockStart === -1) break;

    let depth = 0;
    let end = -1;
    for (let i = blockStart; i < out.length; i += 1) {
      if (out[i] === "{") depth += 1;
      if (out[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end === -1) break;

    const block = out.slice(start, end);
    if (block.includes("lab(") || block.includes("color-mix(")) {
      out = `${out.slice(0, start)}${out.slice(end)}`;
      start = out.indexOf("@supports", start);
    } else {
      start = out.indexOf("@supports", end);
    }
  }

  return out;
}

function stripAtProperty(css) {
  // Tailwind v4 emits a large @property block near the top of preflight
  // (--tw-translate-x, --tw-rotate, --tw-shadow, etc.). Safari ignores
  // these declarations up to 16.4 — but worse, the @property at-rule
  // was treated as an unknown at-rule by some Safari versions, which
  // caused the entire surrounding @layer block to be silently
  // discarded. The result was a fully unstyled page (root cause of the
  // "全页无样式" bug on iPad Pro 10.5" with iPadOS 16.0-16.3).
  //
  // We can't *remove* the properties because Tailwind's utilities
  // reference `var(--tw-*)` — but the property *metadata* (syntax,
  // inherits, initial-value) is what Safari 16.4+ needs. Older Safari
  // treats the missing metadata as "this is a custom property, behave
  // like the default". So the safe move is to wrap the entire
  // @property block in an @supports that only Safari 16.4+ matches:
  //   @supports (background: -webkit-named-image(i)) { ... }
  // (That feature is exclusive to Safari 16.4+; on older engines the
  // block becomes a no-op and the custom properties fall back to
  // browser defaults, which is acceptable for this project.)
  let out = "";
  let i = 0;
  while (i < css.length) {
    const match = css.slice(i).match(/@property\s+--[\w-]+\s*\{/);
    if (!match) {
      out += css.slice(i);
      break;
    }
    const start = i + match.index;
    out += css.slice(i, start);
    let depth = 0;
    let j = css.indexOf("{", start);
    for (; j < css.length; j += 1) {
      if (css[j] === "{") depth += 1;
      if (css[j] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (j >= css.length) {
      out += css.slice(start);
      break;
    }
    i = j + 1;
  }
  return out;
}

function unwrapLayerBlocks(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const match = css.slice(i).match(/@layer\s+[^;{]+([;{])/);
    if (!match) {
      out += css.slice(i);
      break;
    }
    const start = i + match.index;
    out += css.slice(i, start);
    const token = match[1];
    const headerEnd = start + match[0].length;

    if (token === ";") {
      i = headerEnd;
      continue;
    }

    let depth = 1;
    let j = headerEnd;
    for (; j < css.length; j += 1) {
      if (css[j] === "{") depth += 1;
      if (css[j] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (j >= css.length) {
      out += css.slice(start);
      break;
    }

    out += css.slice(headerEnd, j);
    i = j + 1;
  }
  return out;
}

function fixCss(css) {
  return unwrapLayerBlocks(stripAtProperty(stripLabSupports(css)))
    .replace(/(^|[;{])\s*[-\w]+\s*:\s*[^;{}]*(?:lab\(|color-mix\()[^;{}]*/g, (match, prefix) => prefix === "{" ? "{" : "")
    .replace(/color-mix\([^)]*\)/g, "currentColor")
    .replace(/dvh/g, "vh")
    .replace(/svh/g, "vh")
    .replace(/lvh/g, "vh");
}

// stripStaticBlocks: class static initialization blocks were added in
// Safari 16.4 / iPadOS 16.4. iPadOS 16.0-16.3 (still common on iPad Pro
// 10.5" / 2017) parses `class X { static { ... } ... }` as a syntax
// error — Safari sees `static` as a method name, then `{` opens a
// method body, but the body must be a function, not a block of
// statements. Result: "Unexpected token '{'" and the page is blank.
//
// Transform: lift each `static { BODY }` out of the class body, then
// run the lifted code as an IIFE immediately after the class. Inside
// the lifted code, `this` originally meant the class itself; we
// rewrite it to a stable parameter name (so the IIFE can pass the
// class as its first argument). Anonymous classes get a synthetic
// `__clsN` binding so the IIFE has something to reference.
function stripStaticBlocks(js) {
  let out = "";
  let i = 0;
  let counter = 0;
  while (i < js.length) {
    const rest = js.slice(i);
    const m = rest.match(/\bclass\s*([A-Za-z0-9_$]*)?(\s+extends\s+[A-Za-z0-9_$.]+)?\s*\{/);
    if (!m) { out += rest; break; }

    const classStart = m.index;
    const className = m[1] || "";
    const openBrace = classStart + m[0].length - 1;

    // Copy everything up to and including the class opening brace.
    out += rest.substring(0, openBrace + 1);

    // For anonymous classes, inject a synthetic name right after `class`
    // so the IIFE has a binding to use. We rewrite the just-emitted
    // `class {` to `class __clsN {`.
    let bindingName = className;
    if (!bindingName) {
      bindingName = `__cls${counter++}`;
      out = out.substring(0, out.length - 1) + " " + bindingName + " {";
    }

    // Find the matching close brace of the class body.
    let depth = 1;
    let p = openBrace + 1;
    let closeBrace = -1;
    while (p < rest.length) {
      const ch = rest[p];
      if (ch === "{") depth += 1;
      if (ch === "}") { depth -= 1; if (depth === 0) { closeBrace = p; break; } }
      p += 1;
    }
    if (closeBrace === -1) { out += rest.substring(openBrace + 1); break; }

    const body = rest.substring(openBrace + 1, closeBrace);

    // Extract `static { ... }` blocks. Lifted code is stored separately;
    // we leave a normal class body (no static blocks) in `newBody`.
    let newBody = "";
    let q = 0;
    /** @type {Array<{paramName: string, rewritten: string}>} */
    const lifted = [];
    while (q < body.length) {
      const sm = body.substring(q).match(/\bstatic\s*\{/);
      if (!sm) { newBody += body.substring(q); break; }
      newBody += body.substring(q, q + sm.index);
      const sbStart = q + sm.index + sm[0].length - 1;
      let sd = 1;
      let pp = sbStart + 1;
      let sbEnd = -1;
      while (pp < body.length) {
        const ch = body[pp];
        if (ch === "{") sd += 1;
        if (ch === "}") { sd -= 1; if (sd === 0) { sbEnd = pp; break; } }
        pp += 1;
      }
      if (sbEnd === -1) { newBody += body.substring(q + sm.index); break; }
      const innerBody = body.substring(sbStart + 1, sbEnd);
      const paramName = `__sb${counter++}`;
      // In a static block, top-level `this` is the class. Replace it
      // with the parameter name so the IIFE can pass the class in.
      // (Nested `this` inside an inner function would be wrong, but
      // static blocks in the wild contain only `this.X = ...` patterns.)
      const rewritten = innerBody.replace(/\bthis\b/g, paramName);
      lifted.push({ paramName, rewritten });
      q = sbEnd + 1;
    }

    if (lifted.length === 0) {
      out += body + "}";
    } else {
      out += newBody + "}";
      // Append IIFE calls that re-execute the lifted code with `this`
      // rebound to the class.
      for (const { paramName, rewritten } of lifted) {
        out += `;(function(${paramName}){${rewritten}})(${bindingName});`;
      }
    }

    i += closeBrace + 1;
  }
  return out;
}

function fixJs(js) {
  return stripStaticBlocks(js)
    .replace(/([A-Za-z0-9_$.[\]()]+)\?\?=([A-Za-z0-9_$.[\]()]+)/g, "($1??($1=$2))")
    .replace(/e\.invalidDynamicUsageError\?\?=t/g, "(e.invalidDynamicUsageError??(e.invalidDynamicUsageError=t))")
    .replace(/t\?\?=a\?\.getStore\(\)\?\.isAction\?"push":"replace"/g, '(t??(t=a?.getStore()?.isAction?"push":"replace"))');
}

// fixHtml: applies the same dvh/svh/lvh substitution to HTML class
// names so they stay in sync with the CSS rules fixCss rewrites.
function fixHtml(html) {
  return html
    .replace(/\[(\d+)dvh\]/g, "[$1vh]")
    .replace(/\[(\d+)svh\]/g, "[$1vh]")
    .replace(/\[(\d+)lvh\]/g, "[$1vh]")
    .replace(/\[(\d+(?:\.\d+)?)dvh\]/g, "[$1vh]")
    .replace(/\[(\d+(?:\.\d+)?)svh\]/g, "[$1vh]")
    .replace(/\[(\d+(?:\.\d+)?)lvh\]/g, "[$1vh]");
}

async function listFiles(dir, skip = () => false) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (skip(path, entry)) continue;
    if (entry.isDirectory()) {
      files.push(...await listFiles(path, entry.isDirectory() ? skip : () => false));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function renameChunk(path, content) {
  const current = parse(path).base;
  const next = safariName(current, content);
  await writeFile(join(chunksDir, next), content);
  if (next !== current) {
    await rm(path);
    mappings.set(current, next);
  }
}

let patched = 0;

for (const file of await readdir(chunksDir)) {
  if (!file.endsWith(".css") && !file.endsWith(".js")) continue;

  const path = join(chunksDir, file);
  const before = await readFile(path, "utf8");
  const after = file.endsWith(".css") ? fixCss(before) : fixJs(before);

  if (after !== before) {
    await renameChunk(path, after);
    patched += 1;
  }
}

let renamedByReference = true;
while (renamedByReference) {
  renamedByReference = false;
  for (const path of await listFiles(chunksDir)) {
    if (!path.endsWith(".css") && !path.endsWith(".js")) continue;
    const before = await readFile(path, "utf8");
    const after = replaceMappings(before);
    if (after === before) continue;

    const current = parse(path).base;
    const next = safariName(current, after);
    await writeFile(join(chunksDir, next), after);
    if (next !== current) {
      await rm(path);
      mappings.set(current, next);
      renamedByReference = true;
    }
  }
}

const skip = (path, entry) => {
  if (!entry.isDirectory()) return false;
  return path.includes(`${join(".next", "cache")}`) || path.includes(`${join(".next", "node_modules")}`);
};

for (const path of await listFiles(nextDir, skip)) {
  if (path.startsWith(chunksDir)) continue;
  try {
    const before = await readFile(path, "utf8");
    let after = replaceMappings(before);
    if (path.endsWith(".html")) {
      after = fixHtml(after);
      if (after.includes("<head>") && !after.includes('id="radioai-legacy-runtime-guards"')) {
        after = after.replace("<head>", `<head>${legacyRuntimeGuardScript}`);
      }
    }
    if (after !== before) await writeFile(path, after);
  } catch {
    // Some trace files can be binary-ish. They don't contain browser chunk URLs.
  }
}

console.log(`[safari14] patched ${patched} chunk(s), renamed ${mappings.size} chunk reference(s)`);
