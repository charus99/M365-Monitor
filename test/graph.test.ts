import { describe, expect, it } from "vitest";
import { fetchGraph, getToken, graphGet, ISSUES_URL, mapIssue, OVERVIEWS_URL } from "../src/graph";
import { CREDS, fakeGraph, RAW_ISSUE } from "./graph-fixtures";

const noSleep = async () => {};

const tokenOk = () => Response.json({ access_token: "tok" });
const TOKEN = "https://login.microsoftonline.com/";

describe("getToken", () => {
  it("posts client credentials and returns the token", async () => {
    let body = "";
    const g = fakeGraph({ [TOKEN]: (init) => { body = String(init?.body); return tokenOk(); } });
    expect(await getToken(CREDS, g.fn)).toBe("tok");
    expect(g.calls[0]).toBe("https://login.microsoftonline.com/tenant-x/oauth2/v2.0/token");
    expect(body).toContain("grant_type=client_credentials");
    expect(body).toContain("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default");
  });

  it("reports AADSTS code without leaking the secret", async () => {
    const g = fakeGraph({ [TOKEN]: () => Response.json({ error: "invalid_client", error_codes: [7000215] }, { status: 401 }) });
    const err = (await getToken(CREDS, g.fn).catch((e) => e)) as Error;
    expect(err.message).toBe("token request failed: HTTP 401 invalid_client AADSTS7000215");
    expect(err.message).not.toContain("s3cret");
  });
});

describe("graphGet retry", () => {
  it("retries 429 honoring Retry-After, then succeeds", async () => {
    const waits: number[] = [];
    let n = 0;
    const g = fakeGraph({ "https://g/": () => (++n === 1 ? new Response("", { status: 429, headers: { "Retry-After": "3" } }) : Response.json({ ok: 1 })) });
    expect(await graphGet("https://g/x", "t", g.fn, async (ms) => { waits.push(ms); })).toEqual({ ok: 1 });
    expect(waits).toEqual([3000]);
  });

  it("backs off on 5xx and gives up after 3 retries", async () => {
    const waits: number[] = [];
    const g = fakeGraph({ "https://g/": () => new Response("", { status: 503 }) });
    await expect(graphGet("https://g/x?a=1", "t", g.fn, async (ms) => { waits.push(ms); })).rejects.toThrow("GET https://g/x failed: HTTP 503");
    expect(g.calls).toHaveLength(4);
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  it("does not retry other 4xx", async () => {
    const g = fakeGraph({ "https://g/": () => new Response("", { status: 403 }) });
    await expect(graphGet("https://g/x", "t", g.fn, noSleep)).rejects.toThrow("HTTP 403");
    expect(g.calls).toHaveLength(1);
  });

  it("retries network errors", async () => {
    let n = 0;
    const g = fakeGraph({ "https://g/": () => { if (++n < 3) throw new Error("timeout"); return Response.json({ ok: 1 }); } });
    expect(await graphGet("https://g/x", "t", g.fn, noSleep)).toEqual({ ok: 1 });
  });
});

describe("mapIssue", () => {
  const i = mapIssue(RAW_ISSUE);
  it("maps fields and cleans HTML", () => {
    expect(i).toMatchObject({
      id: "EX1234567", service: "Exchange Online", feature: "E-Mail and calendar access",
      classification: "incident", status: "restoringService",
      start: "2026-11-12T19:40:00Z", modified: "2026-11-13T01:58:00Z",
      impact: "Users may be unable to access mail & calendar.",
    });
  });
  it("sorts posts newest first, fixes mojibake, takes nextUpdateBy from the latest post", () => {
    expect(i.posts.map((p) => p.at)).toEqual(["2026-11-13T01:58:00Z", "2026-11-12T19:55:00Z"]);
    expect(i.posts[0].text.startsWith("We’re adding capacity.")).toBe(true);
    expect(i.nextUpdateBy).toBe("2026-11-13T03:00:00.000Z");
  });
  it("treats unknown classification as advisory and tolerates missing posts", () => {
    const m = mapIssue({ id: "X", classification: "unknownFutureValue" });
    expect(m.classification).toBe("advisory");
    expect(m.posts).toEqual([]);
    expect(m.nextUpdateBy).toBeNull();
  });
});

describe("fetchGraph", () => {
  it("follows nextLink paging and maps issues + services", async () => {
    const page2 = "https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues?$skiptoken=abc";
    const g = fakeGraph({
      [TOKEN]: tokenOk,
      [page2]: () => Response.json({ value: [{ ...RAW_ISSUE, id: "TM1", classification: "advisory" }] }),
      [ISSUES_URL]: () => Response.json({ value: [RAW_ISSUE], "@odata.nextLink": page2 }),
      [OVERVIEWS_URL]: () => Response.json({ value: [{ service: "Microsoft Teams", status: "serviceOperational" }, { service: "Exchange Online", status: "serviceDegradation" }] }),
    });
    const r = await fetchGraph(CREDS, g.fn, noSleep);
    expect(r.issues.map((i) => i.id)).toEqual(["EX1234567", "TM1"]);
    expect(r.services).toEqual([
      { name: "Exchange Online", status: "serviceDegradation" },
      { name: "Microsoft Teams", status: "serviceOperational" },
    ]);
  });
});
