// Microsoft consumer products status from status.cloud.microsoft/api/posts/m365Consumer.
// This is the status page's own (undocumented) JSON API, so the shape is validated
// and any mismatch throws instead of producing a half-empty list.
import { fixMojibake, parseNextUpdateBy, stripHtml } from "./text";
import type { ConsumerService } from "./types";

const clean = (s: unknown) => fixMojibake(stripHtml(String(s ?? "")));

export function parseConsumer(json: unknown): ConsumerService[] {
  if (!Array.isArray(json)) throw new Error("consumer feed: expected an array");
  return json.map((raw, i) => {
    if (typeof raw?.ServiceDisplayName !== "string" || typeof raw?.Status !== "string") {
      throw new Error(`consumer feed: item ${i} lacks ServiceDisplayName/Status`);
    }
    const message = clean(raw.Message);
    const updated = typeof raw.LastUpdatedTime === "string" && !raw.LastUpdatedTime.startsWith("0001-")
      ? new Date(raw.LastUpdatedTime).toISOString()
      : null;
    return {
      name: raw.ServiceDisplayName,
      status: raw.Status,
      title: clean(raw.Title),
      message,
      nextUpdateBy: parseNextUpdateBy(message),
      updated,
    };
  });
}
