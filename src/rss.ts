// Parses the public Microsoft 365 status RSS (status.cloud.microsoft/api/feed/mac)
// into the status.json Issue shape. Workers have no DOMParser, and the feed is
// flat RSS 2.0, so tags are extracted with regexes.
import { decodeEntities, fixMojibake, parseNextUpdateBy, stripHtml } from "./text";
import type { Issue } from "./types";

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return "";
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : decodeEntities(m[1]);
}

/** RFC 822 date ("Fri, 13 Nov 2026 02:14:51 Z") -> ISO UTC, or "" if unparseable. */
export function parseRssDate(s: string): string {
  const t = Date.parse(s.trim().replace(/\s(Z|UT)$/i, " GMT"));
  return Number.isNaN(t) ? "" : new Date(t).toISOString();
}

/** "ServiceDegradation" -> "serviceDegradation" (Graph casing). */
function camel(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : "";
}

const LABELS = ["User impact", "More info", "Current status", "Scope of impact", "Next update by"];

/** Splits plain text on "Label:" headings at line starts. */
function sections(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(`^(${LABELS.join("|")}):\\s*`, "gim");
  const hits = [...text.matchAll(re)];
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const label = LABELS.find((l) => l.toLowerCase() === h[1].toLowerCase())!;
    out[label] = text.slice(h.index! + h[0].length, end).trim();
  });
  return out;
}

export function parseRss(xml: string): Issue[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return items.map((item) => {
    const service = fixMojibake(tag(item, "title").trim());
    const text = fixMojibake(stripHtml(tag(item, "description")));
    const at = parseRssDate(tag(item, "pubDate"));
    const sec = sections(text);
    return {
      id: tag(item, "guid").trim(),
      title: sec["User impact"]?.split("\n")[0] || service,
      service,
      feature: "",
      classification: "incident",
      status: camel(tag(item, "status").trim()),
      start: at,
      modified: at,
      impact: sec["More info"] ?? text,
      nextUpdateBy: parseNextUpdateBy(text),
      posts: [{ at, text: sec["Current status"] ?? text }],
    };
  });
}
