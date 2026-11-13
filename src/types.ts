// Shapes of status.json (see M365_HEALTH_MONITOR_SPEC.md).

export type Classification = "incident" | "advisory";

export interface Post {
  at: string; // ISO 8601 UTC
  text: string; // plain text
}

export interface Issue {
  id: string;
  title: string;
  service: string;
  feature: string;
  classification: Classification;
  status: string; // Graph serviceHealthStatus, camelCase
  start: string;
  modified: string;
  impact: string;
  nextUpdateBy: string | null;
  posts: Post[]; // newest first
}

export interface ServiceStatus {
  name: string;
  status: string;
}

/** Microsoft consumer products (Outlook.com, OneDrive personal, ...). Not part of tenant counts. */
export interface ConsumerService {
  name: string;
  status: string; // display text from Microsoft, e.g. "Operational", "Service degradation"
  title: string; // "" when operational
  message: string; // plain text
  nextUpdateBy: string | null;
  updated: string | null;
}

export interface ConsumerStatus {
  fetchedAt: string;
  services: ConsumerService[];
}

export interface StatusFile {
  generatedAt: string;
  source: "graph" | "rss";
  lastGraphSuccessAt: string | null;
  issues: Issue[];
  services: ServiceStatus[];
  consumer: ConsumerStatus | null; // null until fetched once; kept from last success on failure
}
