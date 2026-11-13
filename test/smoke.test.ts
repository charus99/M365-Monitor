import { beforeEach, describe, expect, it } from "vitest";
import worker, { resetMemo } from "../src/index";
import { KEY_STATUS } from "../src/poll";
import { fakeKv } from "./kv";

const call = (kv: KVNamespace, path: string) =>
  worker.fetch(new Request(`https://x.test${path}`) as never, { STATUS: kv, RSS_URL: "" });

describe("worker fetch", () => {
  beforeEach(resetMemo);

  it("returns 404 for unknown routes", async () => {
    expect((await call(fakeKv(), "/nope")).status).toBe(404);
  });

  it("returns 503 before the first poll", async () => {
    const res = await call(fakeKv(), "/status.json");
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves status.json from KV and memoizes it", async () => {
    const kv = fakeKv({ [KEY_STATUS]: '{"generatedAt":"t"}' });
    const res = await call(kv, "/status.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toEqual({ generatedAt: "t" });
    await call(kv, "/status.json");
    expect(kv.reads).toBe(1);
  });
});
