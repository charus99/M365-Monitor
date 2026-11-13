// Minimal in-memory stand-in for KVNamespace (only get/put as used by the app).
export function fakeKv(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  const kv = {
    data,
    reads: 0,
    async get(key: string, type?: "text" | "json") {
      kv.reads++;
      const v = data.get(key);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
  };
  return kv as typeof kv & KVNamespace;
}
