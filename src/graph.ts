// Microsoft Graph service health client (client credentials, read-only).
import { fixMojibake, parseNextUpdateBy, stripHtml } from "./text";
import type { Issue, ServiceStatus } from "./types";

export interface GraphCreds {
  TENANT_ID: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
}

export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GRAPH = "https://graph.microsoft.com/v1.0/admin/serviceAnnouncement";
export const ISSUES_URL = `${GRAPH}/issues?$filter=${encodeURIComponent("isResolved eq false")}`;
export const OVERVIEWS_URL = `${GRAPH}/healthOverviews?$select=service,status`;

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 10_000;
const MAX_PAGES = 20;

export async function getToken(c: GraphCreds, fetchFn: typeof fetch = fetch): Promise<string> {
  const res = await fetchFn(`https://login.microsoftonline.com/${encodeURIComponent(c.TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.CLIENT_ID,
      client_secret: c.CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_codes?: number[] };
  if (!res.ok || !body.access_token) {
    // Never include the request body (it holds the secret) in the message.
    const code = body.error_codes?.length ? ` AADSTS${body.error_codes[0]}` : "";
    throw new Error(`token request failed: HTTP ${res.status} ${body.error ?? ""}${code}`.trim());
  }
  return body.access_token;
}

function retryDelay(res: Response | null, attempt: number): number {
  const ra = Number(res?.headers.get("Retry-After"));
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, MAX_RETRY_AFTER_MS);
  return 1000 * 2 ** attempt; // 1s, 2s, 4s
}

/** GET with retry on 429/5xx/network errors. */
export async function graphGet(url: string, token: string, fetchFn: typeof fetch = fetch, sleep: Sleep = realSleep): Promise<any> {
  let lastErr = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetchFn(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return res.json();
      lastErr = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break; // 4xx: retrying will not help
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    if (attempt < MAX_RETRIES) await sleep(retryDelay(res, attempt));
  }
  throw new Error(`GET ${url.split("?")[0]} failed: ${lastErr}`);
}

/** Follows @odata.nextLink and returns all `value` items. */
export async function graphGetAll(url: string, token: string, fetchFn: typeof fetch = fetch, sleep: Sleep = realSleep): Promise<any[]> {
  const out: any[] = [];
  let next: string | undefined = url;
  for (let page = 0; next; page++) {
    if (page >= MAX_PAGES) throw new Error(`paging exceeded ${MAX_PAGES} pages for ${url.split("?")[0]}`);
    const body: any = await graphGet(next, token, fetchFn, sleep);
    out.push(...(body.value ?? []));
    next = body["@odata.nextLink"];
  }
  return out;
}

const clean = (html: unknown) => fixMojibake(stripHtml(String(html ?? "")));

export function mapIssue(raw: any): Issue {
  const posts = (raw.posts ?? [])
    .map((p: any) => ({ at: p.createdDateTime ?? "", text: clean(p.description?.content) }))
    .sort((a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at));
  return {
    id: String(raw.id ?? ""),
    title: fixMojibake(String(raw.title ?? "")),
    service: String(raw.service ?? ""),
    feature: String(raw.feature ?? ""),
    classification: raw.classification === "incident" ? "incident" : "advisory",
    status: String(raw.status ?? ""),
    start: raw.startDateTime ?? "",
    modified: raw.lastModifiedDateTime ?? "",
    impact: clean(raw.impactDescription),
    nextUpdateBy: posts.length ? parseNextUpdateBy(posts[0].text) : null,
    posts,
  };
}

export async function fetchGraph(
  c: GraphCreds,
  fetchFn: typeof fetch = fetch,
  sleep: Sleep = realSleep,
): Promise<{ issues: Issue[]; services: ServiceStatus[] }> {
  const token = await getToken(c, fetchFn);
  const [rawIssues, rawOverviews] = await Promise.all([
    graphGetAll(ISSUES_URL, token, fetchFn, sleep),
    graphGetAll(OVERVIEWS_URL, token, fetchFn, sleep),
  ]);
  return {
    issues: rawIssues.filter((i) => i.isResolved !== true).map(mapIssue),
    services: rawOverviews
      .map((o) => ({ name: String(o.service ?? ""), status: String(o.status ?? "") }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
