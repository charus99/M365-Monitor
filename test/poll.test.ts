import { describe, expect, it } from "vitest";
import { ISSUES_URL, OVERVIEWS_URL } from "../src/graph";
import { KEY_STATE, KEY_STATUS, poll } from "../src/poll";
import type { StatusFile } from "../src/types";
import fixture from "./fixtures/rss-mac.xml?raw";
import { CREDS, fakeGraph, RAW_ISSUE } from "./graph-fixtures";
import { fakeKv } from "./kv";

const RSS_URL = "https://rss.example/feed";
const now = new Date("2026-11-13T03:05:00Z");
const noSleep = async () => {};

const rssOk = () => new Response(fixture);
const graphRoutes = {
  "https://login.microsoftonline.com/": () => Response.json({ access_token: "tok" }),
  [ISSUES_URL]: () => Response.json({ value: [RAW_ISSUE] }),
  [OVERVIEWS_URL]: () => Response.json({ value: [{ service: "Exchange Online", status: "serviceDegradation" }] }),
};
const graphDown = { ...graphRoutes, [ISSUES_URL]: () => new Response("", { status: 503 }) };

const status = (kv: ReturnType<typeof fakeKv>): StatusFile => JSON.parse(kv.data.get(KEY_STATUS)!);
const fails = (kv: ReturnType<typeof fakeKv>) => JSON.parse(kv.data.get(KEY_STATE) ?? '{"graphFailures":0}').graphFailures;

const graphStatus: StatusFile = {
  generatedAt: "2026-11-13T03:00:00.000Z", source: "graph", lastGraphSuccessAt: "2026-11-13T03:00:00.000Z",
  issues: [], services: [{ name: "Exchange Online", status: "serviceOperational" }],
};

describe("poll without Graph credentials", () => {
  it("uses RSS", async () => {
    const kv = fakeKv();
    const g = fakeGraph({ [RSS_URL]: rssOk });
    expect(await poll({ STATUS: kv, RSS_URL }, now, g.fn)).toEqual({ action: "rss", graphError: undefined });
    expect(status(kv)).toMatchObject({ generatedAt: "2026-11-13T03:05:00.000Z", source: "rss", lastGraphSuccessAt: null, services: [] });
    expect(status(kv).issues).toHaveLength(1);
  });
});

describe("poll with Graph", () => {
  const env = (kv: KVNamespace) => ({ STATUS: kv, RSS_URL, ...CREDS });

  it("writes Graph data and does not touch RSS", async () => {
    const kv = fakeKv();
    const g = fakeGraph(graphRoutes);
    expect((await poll(env(kv), now, g.fn, noSleep)).action).toBe("graph");
    expect(status(kv)).toMatchObject({ source: "graph", lastGraphSuccessAt: "2026-11-13T03:05:00.000Z",
      services: [{ name: "Exchange Online", status: "serviceDegradation" }] });
    expect(status(kv).issues[0].id).toBe("EX1234567");
    expect(g.calls.some((u) => u.startsWith(RSS_URL))).toBe(false);
    expect(kv.data.has(KEY_STATE)).toBe(false); // no extra KV write when nothing failed
  });

  it("keeps previous data on the first failure", async () => {
    const kv = fakeKv({ [KEY_STATUS]: JSON.stringify(graphStatus) });
    const g = fakeGraph({ ...graphDown, [RSS_URL]: rssOk });
    const r = await poll(env(kv), now, g.fn, noSleep);
    expect(r.action).toBe("kept");
    expect(r.graphError).toContain("HTTP 503");
    expect(status(kv)).toEqual(graphStatus);
    expect(fails(kv)).toBe(1);
  });

  it("falls back to RSS on the second consecutive failure, keeping the Graph service list", async () => {
    const kv = fakeKv({ [KEY_STATUS]: JSON.stringify(graphStatus), [KEY_STATE]: '{"graphFailures":1}' });
    const g = fakeGraph({ ...graphDown, [RSS_URL]: rssOk });
    expect((await poll(env(kv), now, g.fn, noSleep)).action).toBe("rss");
    expect(status(kv)).toMatchObject({ source: "rss", lastGraphSuccessAt: graphStatus.lastGraphSuccessAt, services: graphStatus.services });
    expect(fails(kv)).toBe(2);
  });

  it("falls back immediately when there is no previous data", async () => {
    const kv = fakeKv();
    const g = fakeGraph({ ...graphDown, [RSS_URL]: rssOk });
    expect((await poll(env(kv), now, g.fn, noSleep)).action).toBe("rss");
    expect(status(kv).source).toBe("rss");
  });

  it("switches back to Graph and resets the counter", async () => {
    const kv = fakeKv({ [KEY_STATUS]: JSON.stringify({ ...graphStatus, source: "rss" }), [KEY_STATE]: '{"graphFailures":5}' });
    expect((await poll(env(kv), now, fakeGraph(graphRoutes).fn, noSleep)).action).toBe("graph");
    expect(status(kv).source).toBe("graph");
    expect(fails(kv)).toBe(0);
  });

  it("keeps previous status.json when Graph and RSS both fail", async () => {
    const before = JSON.stringify(graphStatus);
    const kv = fakeKv({ [KEY_STATUS]: before, [KEY_STATE]: '{"graphFailures":1}' });
    const g = fakeGraph({ ...graphDown, [RSS_URL]: () => new Response("", { status: 502 }) });
    await expect(poll(env(kv), now, g.fn, noSleep)).rejects.toThrow("HTTP 502");
    expect(kv.data.get(KEY_STATUS)).toBe(before);
  });
});
