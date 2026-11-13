import { describe, expect, it } from "vitest";
import { KEY_SERVICES, KEY_STATUS, poll } from "../src/poll";
import type { StatusFile } from "../src/types";
import fixture from "./fixtures/rss-mac.xml?raw";
import { fakeKv } from "./kv";

const RSS_URL = "https://rss.example/feed";
const now = new Date("2026-11-13T03:05:00Z");
const ok = (async () => new Response(fixture)) as typeof fetch;

describe("poll (RSS)", () => {
  it("writes status.json with generatedAt, source and parsed issues", async () => {
    const kv = fakeKv();
    await poll({ STATUS: kv, RSS_URL }, now, ok);
    const s: StatusFile = JSON.parse(kv.data.get(KEY_STATUS)!);
    expect(s.generatedAt).toBe("2026-11-13T03:05:00.000Z");
    expect(s.source).toBe("rss");
    expect(s.lastGraphSuccessAt).toBeNull();
    expect(s.issues).toHaveLength(1);
    expect(s.services).toEqual([]);
  });

  it("keeps lastGraphSuccessAt and last Graph services from KV", async () => {
    const kv = fakeKv({
      [KEY_STATUS]: JSON.stringify({ lastGraphSuccessAt: "2026-11-13T01:00:00Z" }),
      [KEY_SERVICES]: JSON.stringify([{ name: "Exchange Online", status: "serviceOperational" }]),
    });
    const s = await poll({ STATUS: kv, RSS_URL }, now, ok);
    expect(s.lastGraphSuccessAt).toBe("2026-11-13T01:00:00Z");
    expect(s.services).toEqual([{ name: "Exchange Online", status: "serviceOperational" }]);
  });

  it("does not overwrite status.json when the feed fails", async () => {
    const before = JSON.stringify({ generatedAt: "old" });
    const kv = fakeKv({ [KEY_STATUS]: before });
    const fail = (async () => new Response("nope", { status: 502 })) as typeof fetch;
    await expect(poll({ STATUS: kv, RSS_URL }, now, fail)).rejects.toThrow("HTTP 502");
    expect(kv.data.get(KEY_STATUS)).toBe(before);
  });
});
