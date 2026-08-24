export type Severity = "SEV-1" | "SEV-2" | "SEV-3";

export type IncidentStatus =
  | "open"
  | "investigating"
  | "awaiting_approval"
  | "resolved";

export type ServiceStatus = "healthy" | "degraded" | "down";

export interface Service {
  id: string;
  name: string;
  status: ServiceStatus;
  region: string;
  version: string;
}

export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  serviceId: string;
  status: IncidentStatus;
  impact: string;
  createdAt: string;
}

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  awaiting_approval: "Awaiting approval",
  resolved: "Resolved",
};

// Mock fixtures shaped like the Neon tables that replace them.
export const SERVICES: Service[] = [
  { id: "checkout-api", name: "checkout-api", status: "degraded", region: "ap-south-1", version: "v1.4.2" },
  { id: "payments-worker", name: "payments-worker", status: "healthy", region: "ap-south-1", version: "v2.0.8" },
  { id: "search-api", name: "search-api", status: "healthy", region: "ap-south-1", version: "v3.1.0" },
  { id: "auth-svc", name: "auth-svc", status: "healthy", region: "ap-south-1", version: "v1.9.4" },
  { id: "notifications", name: "notifications", status: "healthy", region: "ap-south-1", version: "v0.7.2" },
];

export const INCIDENTS: Incident[] = [
  {
    id: "INC-0042",
    title: "Checkout latency 20x baseline after deploy",
    severity: "SEV-1",
    serviceId: "checkout-api",
    status: "investigating",
    impact: "p95 at 2,400 ms · error rate 8.1%",
    createdAt: "2026-08-25T14:02:11Z",
  },
  {
    id: "INC-0041",
    title: "Connection pool exhaustion in payments worker",
    severity: "SEV-2",
    serviceId: "payments-worker",
    status: "awaiting_approval",
    impact: "Queue depth climbing · retries at 3%",
    createdAt: "2026-08-25T11:47:53Z",
  },
  {
    id: "INC-0040",
    title: "Elevated 5xx from search after cache flush",
    severity: "SEV-3",
    serviceId: "search-api",
    status: "resolved",
    impact: "Recovered · error rate back to 0.2%",
    createdAt: "2026-08-24T22:15:30Z",
  },
];

export function getIncident(id: string): Incident | undefined {
  return INCIDENTS.find((incident) => incident.id === id);
}
