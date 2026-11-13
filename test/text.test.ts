import { describe, expect, it } from "vitest";
import { decodeEntities, fixMojibake, parseNextUpdateBy, stripHtml } from "../src/text";

describe("decodeEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &#8217; &#x2019; &nbsp;")).toBe("a & b <c> ’ ’  ");
  });
  it("leaves unknown entities alone", () => {
    expect(decodeEntities("&bogus; &#xZZ;")).toBe("&bogus; &#xZZ;");
  });
});

describe("stripHtml", () => {
  it("turns block tags into lines and drops inline tags", () => {
    expect(stripHtml("<div>Hello <b>world</b></div><div><br></div><div>Second&nbsp;line</div>"))
      .toBe("Hello world\nSecond line");
  });
  it("removes script/style content", () => {
    expect(stripHtml("<p>ok</p><script>alert(1)</script><style>p{}</style>")).toBe("ok");
  });
  it("decodes entities after removing tags (so &lt;b&gt; stays as text)", () => {
    expect(stripHtml("<p>&lt;b&gt; is a tag</p>")).toBe("<b> is a tag");
  });
  it("handles plain text", () => {
    expect(stripHtml("  just   text ")).toBe("just text");
  });
});

describe("fixMojibake", () => {
  it("repairs UTF-8 read as Windows-1252", () => {
    expect(fixMojibake("Weâ€™re investigating")).toBe("We’re investigating");
    expect(fixMojibake("â€œquotedâ€\u009d")).toBe("“quoted”");
  });
  it("leaves correct text unchanged", () => {
    expect(fixMojibake("We’re fine")).toBe("We’re fine");
    expect(fixMojibake("Café")).toBe("Café");
    expect(fixMojibake("ภาษาไทย")).toBe("ภาษาไทย");
  });
});

describe("parseNextUpdateBy", () => {
  it("parses the Microsoft wording", () => {
    expect(parseNextUpdateBy("Next update by: Friday, November 13, 2026, at 3:00 AM UTC"))
      .toBe("2026-11-13T03:00:00.000Z");
  });
  it("handles PM, noon and midnight", () => {
    expect(parseNextUpdateBy("Next update by: Thursday, November 12, 2026, at 11:30 PM UTC"))
      .toBe("2026-11-12T23:30:00.000Z");
    expect(parseNextUpdateBy("Next update by: November 12, 2026, at 12:00 PM UTC")).toBe("2026-11-12T12:00:00.000Z");
    expect(parseNextUpdateBy("Next update by: November 12, 2026, at 12:00 AM UTC")).toBe("2026-11-12T00:00:00.000Z");
  });
  it("uses the last occurrence", () => {
    const t = "Next update by: November 12, 2026, at 1:00 AM UTC\n...\nNext update by: November 12, 2026, at 5:00 AM UTC";
    expect(parseNextUpdateBy(t)).toBe("2026-11-12T05:00:00.000Z");
  });
  it("returns null when missing or invalid", () => {
    expect(parseNextUpdateBy("This is the final update.")).toBeNull();
    expect(parseNextUpdateBy("Next update by: Smarch 1, 2026, at 1:00 AM UTC")).toBeNull();
  });
});
