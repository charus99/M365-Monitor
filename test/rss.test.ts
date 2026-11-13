import { describe, expect, it } from "vitest";
import { parseRss, parseRssDate } from "../src/rss";
import fixture from "./fixtures/rss-mac.xml?raw";

describe("parseRssDate", () => {
  it("parses the feed's 'Z' zone", () => {
    expect(parseRssDate("Fri, 13 Nov 2026 02:14:51 Z")).toBe("2026-11-13T02:14:51.000Z");
    expect(parseRssDate("Fri, 13 Nov 2026 02:14:51 GMT")).toBe("2026-11-13T02:14:51.000Z");
  });
  it("returns empty string for garbage", () => {
    expect(parseRssDate("not a date")).toBe("");
  });
});

describe("parseRss (real feed fixture)", () => {
  const [issue, ...rest] = parseRss(fixture);

  it("maps the single item to the status.json shape", () => {
    expect(rest).toHaveLength(0);
    expect(issue).toMatchObject({
      id: "abb317d6-6edc-43c2-b11c-4f4626ba6055",
      service: "Microsoft Admin Center",
      title: "Users may be unable to connect to multiple Microsoft 365 services.",
      classification: "incident",
      status: "serviceDegradation",
      start: "2026-11-13T02:14:51.000Z",
      modified: "2026-11-13T02:14:51.000Z",
      nextUpdateBy: "2026-11-13T03:00:00.000Z",
    });
  });

  it("puts 'More info' + bullets in impact and 'Current status' in the post", () => {
    expect(issue.impact.startsWith("Features of the Microsoft 365 services below")).toBe(true);
    expect(issue.impact).toContain("- Exchange Online:");
    expect(issue.impact).not.toContain("Current status");
    expect(issue.posts).toHaveLength(1);
    expect(issue.posts[0].text.startsWith("We’re applying infrastructure")).toBe(true);
    expect(issue.posts[0].text).not.toContain("Scope of impact");
  });

  it("leaves no HTML tags or entities in text", () => {
    for (const s of [issue.title, issue.impact, issue.posts[0].text]) {
      expect(s).not.toMatch(/<[a-z\/]|&[a-z#]+;/i);
    }
  });
});

describe("parseRss (edge cases)", () => {
  it("returns [] for an empty channel", () => {
    expect(parseRss("<rss><channel><title>x</title></channel></rss>")).toEqual([]);
  });

  it("falls back when description has no section labels, and fixes mojibake", () => {
    const xml = `<rss><channel><item><guid>g1</guid><title>Teams</title>
      <description>&lt;p&gt;Weâ€™re looking into it&lt;/p&gt;</description>
      <pubDate>Fri, 13 Nov 2026 02:14:51 Z</pubDate><status>Investigating</status></item></channel></rss>`;
    const [i] = parseRss(xml);
    expect(i.title).toBe("Teams");
    expect(i.status).toBe("investigating");
    expect(i.impact).toBe("We’re looking into it");
    expect(i.posts[0].text).toBe("We’re looking into it");
    expect(i.nextUpdateBy).toBeNull();
  });

  it("supports CDATA descriptions", () => {
    const xml = `<rss><channel><item><guid>g2</guid><title>X</title>
      <description><![CDATA[<div>User impact: Things fail.</div>]]></description>
      <pubDate>Fri, 13 Nov 2026 02:14:51 Z</pubDate><status>ServiceInterruption</status></item></channel></rss>`;
    expect(parseRss(xml)[0].title).toBe("Things fail.");
  });
});
