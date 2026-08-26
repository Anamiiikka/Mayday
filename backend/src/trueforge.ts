/**
 * Thin client over the TrueForge HTTP API, plus normalisation of its raw event
 * stream into the timeline shape the Command Room renders.
 */

const BASE = process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790";
const AGENT = process.env.TRUEFORGE_AGENT ?? "incident-responder";

/** Tools that only read state — safe to run without asking anyone. */
const READ_ONLY = new Set([
  "get_service_health",
  "query_metrics",
  "search_logs",
  "list_deployments",
  "get_incident",
]);

/** Tools that change the cloud — the harness pauses on these. */
const GUARDED = new Set([
  "restart_service",
  "rollback_deployment",
  "scale_service",
  "resolve_incident",
]);

export type StepKind = "read" | "sandbox" | "guarded" | "harness" | "message";

export interface TimelineStep {
  id: string;
  kind: StepKind;
  /** Tool name, or a short label for narration steps. */
  label: string;
  detail?: string;
  args?: unknown;
  result?: string;
  failed?: boolean;
  at: string;
}

export interface PendingApproval {
  threadId: string;
  toolCallId: string;
  tool: string;
  args: unknown;
  /** The agent's stated reason, pulled from the call arguments when present. */
  reason?: string;
}

export interface AgentState {
  sessionId: string;
  status: "investigating" | "awaiting_approval" | "done" | "error";
  steps: TimelineStep[];
  pending: PendingApproval | null;
  error?: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as { data?: T; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(body.error?.message ?? `TrueForge ${path} failed (${res.status})`);
  }
  return body.data as T;
}

interface RawToolCall {
  id: string;
  source_event_id?: string;
  function?: { name: string; arguments: string };
}

interface RawEvent {
  type: string;
  id: string;
  created_at: string;
  thread_id?: string | null;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: RawToolCall[];
  state?: { status?: string; message?: string; required_actions?: RawEvent[] };
}

/** Harness bookkeeping: real work for the model, noise for an operator. */
const INTERNAL = new Set(["list_tools", "get_tool_info", "get_current_datetime"]);

/** Unwrap a tool call into the real tool name and arguments. */
function readCall(call: RawToolCall): {
  name: string;
  args: unknown;
  internal: boolean;
} {
  const fn = call.function;
  if (!fn) return { name: "unknown", args: {}, internal: true };
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(fn.arguments || "{}") as Record<string, unknown>;
  } catch {
    parsed = { raw: fn.arguments };
  }
  // The harness wraps MCP tools in call_tool and sandbox runs in exec. Schema
  // lookups also carry a tool_name, so judge by the outer call, not the target.
  const internal = INTERNAL.has(fn.name);
  if (!internal && typeof parsed.tool_name === "string") {
    return { name: parsed.tool_name, args: parsed.input ?? {}, internal };
  }
  return { name: fn.name, args: parsed, internal };
}

function classify(tool: string): StepKind {
  if (READ_ONLY.has(tool)) return "read";
  if (GUARDED.has(tool)) return "guarded";
  if (tool === "exec") return "sandbox";
  return "harness";
}

function describe(tool: string, args: unknown): string | undefined {
  const a = (args ?? {}) as Record<string, unknown>;
  if (tool === "exec") {
    const command = String(a.command ?? "");
    return command.length > 600 ? `${command.slice(0, 600)}…` : command;
  }
  const parts = Object.entries(a)
    .filter(([key]) => key !== "reason" && key !== "resolution")
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Fold the raw event log into ordered steps. Tool responses are matched back to
 * their calls so each step carries both what was asked and what came back.
 */
export function buildTimeline(events: RawEvent[]): {
  steps: TimelineStep[];
  callInfo: Map<string, { name: string; args: unknown }>;
  error?: string;
} {
  const steps: TimelineStep[] = [];
  const byCallId = new Map<string, TimelineStep>();
  const callInfo = new Map<string, { name: string; args: unknown }>();
  let error: string | undefined;

  for (const event of events) {
    switch (event.type) {
      case "model.message": {
        if (typeof event.content === "string" && event.content.trim()) {
          steps.push({
            id: event.id,
            kind: "message",
            label: "Agent",
            detail: event.content.trim(),
            at: event.created_at,
          });
        }
        for (const call of event.tool_calls ?? []) {
          if (!call.function) continue;
          const { name, args, internal } = readCall(call);
          if (internal) continue;
          const step: TimelineStep = {
            id: call.id,
            kind: classify(name),
            label: name,
            detail: describe(name, args),
            args,
            at: event.created_at,
          };
          callInfo.set(call.id, { name, args });
          byCallId.set(call.id, step);
          steps.push(step);
        }
        break;
      }
      case "tool.response": {
        const step = event.tool_call_id ? byCallId.get(event.tool_call_id) : undefined;
        if (!step) break;
        const content = event.content;
        const text =
          typeof content === "string" ? content : JSON.stringify(content, null, 2);
        step.result = text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
        step.failed = /^\s*\{\s*"(error|ok)"\s*:/.test(text)
          ? !/"ok"\s*:\s*true/.test(text)
          : false;
        break;
      }
      case "turn.done": {
        if (event.state?.status === "error") error = event.state.message;
        break;
      }
    }
  }

  return { steps, callInfo, error };
}

export async function startInvestigation(incidentId: string, title: string) {
  const session = await api<{ id: string }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ agent: { name: AGENT } }),
  });
  const turn = await api<{ id: string }>(`/sessions/${session.id}/turns`, {
    method: "POST",
    body: JSON.stringify({
      stream: false,
      input: [
        {
          type: "user.message",
          content: `Investigate incident ${incidentId} (${title}). Diagnose the root cause and propose a remediation.`,
        },
      ],
    }),
  });
  return { sessionId: session.id, turnId: turn.id };
}

export async function getAgentState(sessionId: string): Promise<AgentState> {
  // Session events arrive newest-first and wrapped as { turn_id, event },
  // unlike the per-turn feed. Unwrap and restore chronological order.
  const wrapped = await api<Array<{ turn_id?: string; event: RawEvent }>>(
    `/sessions/${sessionId}/events`,
  );
  const events = wrapped
    .map((entry) => entry.event ?? (entry as unknown as RawEvent))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const { steps, callInfo, error } = buildTimeline(events);

  const turns = await api<
    Array<{ id: string; created_at: string; state?: RawEvent["state"] }>
  >(`/sessions/${sessionId}/turns`);
  const latest = [...turns].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  ).at(-1);

  // The newest turn is the truth: a resumed turn supersedes the approval that
  // started it, so a stale pause never lingers in front of the operator.
  const running = turns.some((turn) => turn.state?.status === "running");
  let pending: PendingApproval | null = null;
  if (!running) {
    for (const action of latest?.state?.required_actions ?? []) {
      if (action.type !== "tool.approval_required") continue;
      for (const call of action.tool_calls ?? []) {
        const info = callInfo.get(call.id);
        const args = (info?.args ?? {}) as Record<string, unknown>;
        pending = {
          threadId: action.thread_id ?? "main",
          toolCallId: call.id,
          tool: info?.name ?? "unknown",
          args,
          reason:
            typeof args.reason === "string"
              ? args.reason
              : typeof args.resolution === "string"
                ? args.resolution
                : undefined,
        };
      }
    }
  }

  let status: AgentState["status"] = "investigating";
  if (latest?.state?.status === "error") status = "error";
  else if (pending) status = "awaiting_approval";
  else if (!running) status = "done";

  return {
    sessionId,
    status,
    steps,
    pending,
    error: latest?.state?.status === "error" ? latest.state.message : error,
  };
}

export async function submitApproval(
  sessionId: string,
  threadId: string,
  toolCallId: string,
  decision: "allow" | "deny",
) {
  const turn = await api<{ id: string }>(`/sessions/${sessionId}/turns`, {
    method: "POST",
    body: JSON.stringify({
      stream: false,
      input: [
        {
          type: "user.tool_approval",
          thread_id: threadId,
          tool_call_id: toolCallId,
          approval: { status: decision },
        },
      ],
    }),
  });
  return { turnId: turn.id };
}
