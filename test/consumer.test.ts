import { describe, expect, it } from "vitest";
import { parseConsumer } from "../src/consumer";
import fixture from "./fixtures/m365-consumer.json?raw";

describe("parseConsumer (real fixture)", () => {
  const list = parseConsumer(JSON.parse(fixture));

  it("keeps Microsoft's order and maps names/statuses", () => {
    expect(list).toHaveLength(10);
    expect(list[0]).toMatchObject({ name: "Microsoft 365 (Consumer)", status: "Service degradation" });
    expect(list.map((s) => s.name)).toContain("Outlook.com");
    expect(list.filter((s) => s.status === "Operational")).toHaveLength(9);
  });

  it("extracts title, plain-text message and nextUpdateBy for the affected service", () => {
    const s = list[0];
    expect(s.title).toBe("Users may be unable to access or perform several actions in Microsoft 365 services");
    expect(s.message.startsWith("User impact:")).toBe(true);
    expect(s.message).toContain("\nCurrent status:");
    expect(s.nextUpdateBy).toBe("2026-11-13T04:30:00.000Z");
    expect(s.updated).toBe("2026-11-13T00:36:10.067Z");
  });

  it("leaves operational services with empty text", () => {
    const ok = list.find((s) => s.name === "OneDrive")!;
    expect(ok).toMatchObject({ title: "", message: "", nextUpdateBy: null });
  });
});

describe("parseConsumer (format changes)", () => {
  it("throws when the payload is not an array", () => {
    expect(() => parseConsumer({ value: [] })).toThrow("expected an array");
  });
  it("throws when required fields are missing", () => {
    expect(() => parseConsumer([{ Name: "x" }])).toThrow("item 0");
  });
  it("treats the 0001-01-01 placeholder date as unknown and strips HTML", () => {
    const [s] = parseConsumer([{ ServiceDisplayName: "X", Status: "Operational", LastUpdatedTime: "0001-01-01T00:00:00+00:00", Message: "<p>a &amp; b</p>" }]);
    expect(s.updated).toBeNull();
    expect(s.message).toBe("a & b");
  });
});
