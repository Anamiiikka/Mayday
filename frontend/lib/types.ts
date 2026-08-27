/** Shared shapes for incident data and the agent proxy. */

export type Severity = "SEV-1" | "SEV-2" | "SEV-3";

export type IncidentStatus =
  | "open"
  | "investigating"
  | "awaiting_approval"
  | "resolved";

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  awaiting_approval: "Awaiting approval",
  resolved: "Resolved",
};

export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  service_id: string;
  status: IncidentStatus;
  impact: string;
  created_at: string;
}

export interface Service {
  id: string;
  status: "healthy" | "degraded" | "down";
  region: string;
  version: string;
  replicas: number;
  latency_p95_ms: number | null;
  error_rate: number | null;
  cpu_pct: number | null;
}

export interface MetricPoint {
  at: string;
  latency_p95_ms: number;
  error_rate: number;
}

export interface LogGroup {
  level: string;
  endpoint: string;
  message: string;
  occurrences: number;
}

export interface Deployment {
  version: string;
  deployed_at: string;
  status: string;
  changelog: string;
}

export interface IncidentAction {
  type: string;
  params: Record<string, unknown>;
  executed_at: string;
  result: string;
}

export interface IncidentDetail {
  incident: Incident;
  metrics: MetricPoint[];
  logs: LogGroup[];
  deployments: Deployment[];
  actions: IncidentAction[];
}

export type StepKind =
  | "read"
  | "sandbox"
  | "guarded"
  | "harness"
  | "message"
  | "subagent";

export interface TimelineStep {
  id: string;
  kind: StepKind;
  label: string;
  detail?: string;
  args?: unknown;
  result?: string;
  failed?: boolean;
  /** Set when the step was performed by a sub-agent, not the main thread. */
  lane?: string;
  at: string;
}

export interface PendingApproval {
  threadId: string;
  toolCallId: string;
  tool: string;
  args: Record<string, unknown>;
  reason?: string;
}

export interface AgentState {
  sessionId: string;
  status: "investigating" | "awaiting_approval" | "done" | "error";
  steps: TimelineStep[];
  pending: PendingApproval | null;
  error?: string;
}
