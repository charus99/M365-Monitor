// One poll cycle: fetch source, build status.json, store in KV.
import { parseRss } from "./rss";
import type { ServiceStatus, StatusFile } from "./types";

export interface Env {
  STATUS: KVNamespace;
  RSS_URL: string;
}

export const KEY_STATUS = "status.json";
export const KEY_SERVICES = "services"; // last service list from Graph (used during RSS fallback)

const FETCH_TIMEOUT_MS = 10_000;

export async function fetchText(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const res = await fetchFn(url, {
    headers: { "User-Agent": "m365-monitor" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

/**
 * Polls the RSS feed and writes status.json. On failure the previous status.json
 * is kept untouched (it then turns Stale on the page) and the error is rethrown
 * so it shows up in Worker logs.
 */
export async function poll(env: Env, now: Date = new Date(), fetchFn: typeof fetch = fetch): Promise<StatusFile> {
  const prev = await env.STATUS.get<StatusFile>(KEY_STATUS, "json");
  const services = (await env.STATUS.get<ServiceStatus[]>(KEY_SERVICES, "json")) ?? [];

  const issues = parseRss(await fetchText(env.RSS_URL, fetchFn));

  const status: StatusFile = {
    generatedAt: now.toISOString(),
    source: "rss",
    lastGraphSuccessAt: prev?.lastGraphSuccessAt ?? null,
    issues,
    services,
  };
  await env.STATUS.put(KEY_STATUS, JSON.stringify(status));
  return status;
}
