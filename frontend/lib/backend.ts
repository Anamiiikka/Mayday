import "server-only";
import type {
  AgentState,
  Incident,
  IncidentDetail,
  Service,
} from "./types";

/**
 * Server-side access to the Mayday backend.
 *
 * The operator token lives here and only here. Browsers never call the backend
 * directly — they go through this app's route handlers — so approving a
 * restart or rollback cannot be replayed by anything that merely reached the
 * backend's port.
 */

const BASE = process.env.API_URL ?? "http://localhost:4000";
const TOKEN = process.env.OPERATOR_TOKEN;

export class BackendError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendError";
    this.status = status;
  }
}

export async function callBackend<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new BackendError(
      `Cannot reach the Mayday backend at ${BASE}. Start it with "npm run dev" in backend/.`,
      503,
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new BackendError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export const listIncidents = () =>
  callBackend<{ incidents: Incident[]; services: Service[] }>("/incidents");

export const getIncident = (id: string) =>
  callBackend<IncidentDetail>(`/incidents/${encodeURIComponent(id)}`);

export const startInvestigation = (incidentId: string) =>
  callBackend<{ sessionId: string; turnId: string }>("/agent/investigate", {
    method: "POST",
    body: JSON.stringify({ incidentId }),
  });

export const getAgentState = (sessionId: string) =>
  callBackend<AgentState>(`/agent/sessions/${encodeURIComponent(sessionId)}`);

export const decideApproval = (input: {
  sessionId: string;
  threadId: string;
  toolCallId: string;
  decision: "allow" | "deny";
}) =>
  callBackend<{ turnId: string }>("/agent/approve", {
    method: "POST",
    body: JSON.stringify(input),
  });
