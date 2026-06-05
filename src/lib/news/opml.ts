// OPML parser
// Uses fast-xml-parser. Extracts every <outline> element and its attributes.
// OPML 2.0 spec: outlines can be nested (categories). We extract all outlines
// at any depth that have an xmlUrl attribute.

import { XMLParser } from "fast-xml-parser";

export interface ParsedOutline {
  xmlUrl: string;
  title: string;
  text: string;
  type: string;
  htmlUrl: string;
  description: string;
  language: string;
  [extra: string]: string;
}

export interface ParseOk {
  ok: true;
  feeds: ParsedOutline[];
}

export interface ParseErr {
  ok: false;
  error: string;
  message: string;
}

export type ParseResult = ParseOk | ParseErr;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  trimValues: true,
});

const ATTRS = ["xmlUrl", "title", "text", "type", "htmlUrl", "description", "language"] as const;

export function parseOpml(xml: string): ParseResult {
  if (!xml || typeof xml !== "string") {
    return { ok: false, error: "INVALID_XML", message: "OPML content is empty or not a string" };
  }
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: "INVALID_XML", message: `Failed to parse OPML: ${message}` };
  }
  const root = (parsed as Record<string, unknown>).opml;
  if (!root) {
    return { ok: false, error: "INVALID_XML", message: 'Missing <opml> root element' };
  }
  const body = (root as Record<string, unknown>).body;
  if (body === undefined || body === null) {
    return { ok: false, error: "INVALID_XML", message: 'Missing <body> inside <opml>' };
  }
  const feeds: ParsedOutline[] = [];
  if (typeof body === "object") {
    collectOutlines(body, feeds);
  }
  if (feeds.length === 0) {
    return { ok: false, error: "NO_FEEDS", message: "OPML 中未发现任何 <outline xmlUrl=...>" };
  }
  return { ok: true, feeds };
}

// Defense against stack-blowing OPML: a maliciously nested <outline>
// tree would otherwise recurse until we OOM/segfault. The Next.js
// body-size limit already caps the input, but a tight tree within
// that limit can still hit thousands of stack frames.
const MAX_OUTLINE_DEPTH = 32;

function collectOutlines(node: unknown, out: ParsedOutline[], depth: number = 0): void {
  if (!node || typeof node !== "object") return;
  if (depth > MAX_OUTLINE_DEPTH) return;
  const obj = node as Record<string, unknown>;
  const outline = obj.outline;
  const children: unknown[] = [];
  if (Array.isArray(outline)) {
    children.push(...outline);
  } else if (outline && typeof outline === "object") {
    children.push(outline);
  }
  for (const child of children) {
    if (!child || typeof child !== "object") continue;
    const childObj = child as Record<string, unknown>;
    const xmlUrl = (childObj["@_xmlUrl"] as string | undefined) ?? "";
    const item: ParsedOutline = {
      xmlUrl: xmlUrl.trim(),
      title: (childObj["@_title"] as string | undefined) ?? "",
      text: (childObj["@_text"] as string | undefined) ?? "",
      type: (childObj["@_type"] as string | undefined) ?? "",
      htmlUrl: (childObj["@_htmlUrl"] as string | undefined) ?? "",
      description: (childObj["@_description"] as string | undefined) ?? "",
      language: (childObj["@_language"] as string | undefined) ?? "",
    };
    for (const key of Object.keys(childObj)) {
      if (key.startsWith("@_") && !ATTRS.includes(key.slice(2) as (typeof ATTRS)[number])) {
        const v = childObj[key];
        if (typeof v === "string") item[key.slice(2)] = v;
      }
    }
    if (item.xmlUrl.length > 0) {
      out.push(item);
    }
    // Recurse into nested outlines (categories)
    const inner = childObj.outline;
    if (Array.isArray(inner) || (inner && typeof inner === "object")) {
      collectOutlines(childObj, out, depth + 1);
    }
  }
}
