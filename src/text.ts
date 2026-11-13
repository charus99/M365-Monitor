// Pure text helpers for Graph/RSS content.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…", bull: "•",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const BLOCK = /<\s*(br|\/?(div|p|li|ul|ol|tr|h[1-6]))\b[^>]*>/gi;

/** HTML fragment -> plain text. Block tags become line breaks; blank lines collapse. */
export function stripHtml(html: string): string {
  const text = decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
      .replace(BLOCK, "\n")
      .replace(/<[^>]*>/g, ""),
  );
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => l !== "")
    .join("\n");
}

// Windows-1252 code points for bytes 0x80-0x9F (the rest map 1:1 to Latin-1).
const CP1252 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f" +
  "\u0090‘’“”•–—˜™š›œ\u009džŸ";

/**
 * Repairs UTF-8 text that was decoded as Windows-1252 (e.g. "Weâ€™re" -> "We’re").
 * Returns the input unchanged if it does not look like mojibake or cannot be repaired.
 */
export function fixMojibake(s: string): string {
  if (!/[Â-ô][\u0080-¿‘-›€™ŒœŠšŸŽžƒˆ˜]/.test(s)) return s;
  const bytes: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) bytes.push(c);
    else {
      const i = CP1252.indexOf(ch);
      if (i < 0) return s; // not representable in cp1252 -> not mojibake
      bytes.push(0x80 + i);
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

/**
 * Finds "Next update by: Friday, November 13, 2026, at 3:00 AM UTC" and returns ISO UTC,
 * or null if absent/unparseable. Uses the last occurrence (latest wording wins).
 */
export function parseNextUpdateBy(text: string): string | null {
  const re = /Next update by:?\s*(?:[a-z]+day,?\s*)?([a-z]+)\s+(\d{1,2}),?\s*(\d{4}),?\s*(?:at\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(?:UTC|GMT|Z)/gi;
  let last: RegExpExecArray | null = null;
  for (let m; (m = re.exec(text)); ) last = m;
  if (!last) return null;
  const [, mon, day, year, hh, mm, ampm] = last;
  const month = MONTHS.indexOf(mon.toLowerCase());
  if (month < 0) return null;
  let h = Number(hh);
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ampm.toUpperCase() === "PM" ? 12 : 0);
  }
  const d = new Date(Date.UTC(Number(year), month, Number(day), h, Number(mm)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
