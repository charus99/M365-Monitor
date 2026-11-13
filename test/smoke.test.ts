import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("worker", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await worker.fetch();
    expect(res.status).toBe(404);
  });
});
