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

export interface StatusFile {
  generatedAt: string;
  source: "graph" | "rss";
  lastGraphSuccessAt: string | null;
  issues: Issue[];
  services: ServiceStatus[];
}
