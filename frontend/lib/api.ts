/**
 * Browser-side access to the agent, through this app's own route handlers.
 *
 * These never talk to the backend directly: the route handlers add the
 * operator token server-side, so it is never shipped to the browser.
 */

import type { AgentState } from "./types";

export * from "./types";

/** Carries the HTTP status so callers can tell "no such incident" from "backend is down". */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export const startInvestigation = (incidentId: string) =>
  request<{ sessionId: string; turnId: string }>("/agent/investigate", {
    method: "POST",
    body: JSON.stringify({ incidentId }),
  });

export const getAgentState = (sessionId: string) =>
  request<AgentState>(`/agent/sessions/${encodeURIComponent(sessionId)}`);

export const decideApproval = (input: {
  sessionId: string;
  threadId: string;
  toolCallId: string;
  decision: "allow" | "deny";
}) =>
  request<{ turnId: string }>("/agent/approve", {
    method: "POST",
    body: JSON.stringify(input),
  });
