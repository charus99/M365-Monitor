// One poll cycle: Graph first, RSS fallback, store status.json in KV.
import { fetchGraph, type GraphCreds, type Sleep } from "./graph";
import { parseRss } from "./rss";
import type { StatusFile } from "./types";

export interface Env extends Partial<GraphCreds> {
  STATUS: KVNamespace;
  RSS_URL: string;
}

export const KEY_STATUS = "status.json"; // public, served at /status.json
export const KEY_STATE = "state"; // private: { graphFailures }

export const FAILS_BEFORE_FALLBACK = 2;
const FETCH_TIMEOUT_MS = 10_000;

interface State {
  graphFailures: number;
}

export async function fetchText(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const res = await fetchFn(url, {
    headers: { "User-Agent": "m365-monitor" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

function creds(env: Env): GraphCreds | null {
  const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = env;
  return TENANT_ID && CLIENT_ID && CLIENT_SECRET ? { TENANT_ID, CLIENT_ID, CLIENT_SECRET } : null;
}

export interface PollResult {
  action: "graph" | "rss" | "kept"; // kept = Graph failed but below the fallback threshold
  graphError?: string;
}

/**
 * Polls Graph (if credentials are set) and writes status.json.
 * - Graph OK: source "graph", failure counter reset.
 * - Graph fails < FAILS_BEFORE_FALLBACK times in a row: previous status.json kept.
 * - Graph fails >= threshold, no previous data, or no credentials: RSS fallback;
 *   `services` carried over from the previous status.json (last Graph list).
 * - RSS also fails: previous status.json kept (page turns Stale) and the error is thrown.
 */
export async function poll(
  env: Env,
  now: Date = new Date(),
  fetchFn: typeof fetch = fetch,
  sleep?: Sleep,
): Promise<PollResult> {
  const prev = await env.STATUS.get<StatusFile>(KEY_STATUS, "json");
  const state = (await env.STATUS.get<State>(KEY_STATE, "json")) ?? { graphFailures: 0 };
  const c = creds(env);
  let graphError: string | undefined;

  if (c) {
    try {
      const { issues, services } = await fetchGraph(c, fetchFn, sleep);
      const status: StatusFile = {
        generatedAt: now.toISOString(),
        source: "graph",
        lastGraphSuccessAt: now.toISOString(),
        issues,
        services,
      };
      await env.STATUS.put(KEY_STATUS, JSON.stringify(status));
      if (state.graphFailures !== 0) await env.STATUS.put(KEY_STATE, JSON.stringify({ graphFailures: 0 }));
      return { action: "graph" };
    } catch (err) {
      graphError = err instanceof Error ? err.message : String(err);
      state.graphFailures++;
      await env.STATUS.put(KEY_STATE, JSON.stringify(state));
      console.error(`graph poll failed (${state.graphFailures} in a row):`, graphError);
      if (state.graphFailures < FAILS_BEFORE_FALLBACK && prev) return { action: "kept", graphError };
    }
  }

  const issues = parseRss(await fetchText(env.RSS_URL, fetchFn));
  const status: StatusFile = {
    generatedAt: now.toISOString(),
    source: "rss",
    lastGraphSuccessAt: prev?.lastGraphSuccessAt ?? null,
    issues,
    services: prev?.services ?? [],
  };
  await env.STATUS.put(KEY_STATUS, JSON.stringify(status));
  return { action: "rss", graphError };
}
