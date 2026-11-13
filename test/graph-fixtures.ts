// Shared fake Graph data and fetch router for tests.
export const CREDS = { TENANT_ID: "tenant-x", CLIENT_ID: "client-x", CLIENT_SECRET: "s3cret-value" };
export const RAW_ISSUE = {
  id: "EX1234567",
  title: "Users may be unable to connect",
  service: "Exchange Online",
  feature: "E-Mail and calendar access",
  classification: "incident",
  status: "restoringService",
  isResolved: false,
  startDateTime: "2026-11-12T19:40:00Z",
  lastModifiedDateTime: "2026-11-13T01:58:00Z",
  impactDescription: "Users may be unable to access <b>mail</b> &amp; calendar.",
  posts: [
    { createdDateTime: "2026-11-12T19:55:00Z", description: { contentType: "html", content: "<p>Investigating.</p><p>Next update by: Thursday, November 12, 2026, at 9:00 PM UTC</p>" } },
    { createdDateTime: "2026-11-13T01:58:00Z", description: { contentType: "html", content: "<div>Weâ€™re adding capacity.</div><div><br></div><div>Next update by: Friday, November 13, 2026, at 3:00 AM UTC</div>" } },
  ],
};

/** Routes fake Graph/token requests; records every call. */
export function fakeGraph(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    return routes[key](init);
  }) as typeof fetch;
  return { fn, calls };
}
