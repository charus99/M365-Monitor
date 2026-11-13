// Static assets in ./public are served before this handler runs.
import { type Env, KEY_STATUS, poll } from "./poll";

// Per-isolate memory cache so page polling (every 60 s per viewer) does not burn
// KV reads (Free plan: 100k/day). Cache API is not relied on: on *.workers.dev it
// may not take effect.
const MEMO_MS = 30_000;
let memo: { body: string; at: number } | null = null;

export function resetMemo(): void {
  memo = null;
}

async function statusJson(env: Env): Promise<Response> {
  const now = Date.now();
  if (!memo || now - memo.at > MEMO_MS) {
    const body = await env.STATUS.get(KEY_STATUS);
    if (body === null) {
      return Response.json({ error: "No data yet; the first poll has not completed." }, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    memo = { body, at: now };
  }
  return new Response(memo.body, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30" },
  });
}

export default {
  async fetch(req, env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/status.json" && req.method === "GET") return statusJson(env);
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(
      poll(env).catch((err) => {
        console.error("poll failed:", err instanceof Error ? err.message : err);
        throw err;
      }),
    );
  },
} satisfies ExportedHandler<Env>;
