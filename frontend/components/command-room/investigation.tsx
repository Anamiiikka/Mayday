"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  decideApproval,
  getAgentState,
  startInvestigation,
  type AgentState,
  type StepKind,
  type TimelineStep,
} from "@/lib/api";
import { AgentNote } from "@/components/command-room/report";
import { Button } from "@/components/ui/button";

const POLL_MS = 4000;
const SESSION_KEY = (incidentId: string) => `mayday:session:${incidentId}`;

/** How each step is labelled in the timeline: safe, sandboxed, or gated. */
const KIND_STYLE: Record<StepKind, { tag: string; className: string }> = {
  read: { tag: "READ-ONLY", className: "border-border text-foreground/70" },
  sandbox: { tag: "SANDBOX", className: "border-sky-400/40 text-sky-300" },
  guarded: { tag: "NEEDS CLEARANCE", className: "border-primary/50 text-primary" },
  harness: { tag: "HARNESS", className: "border-border text-muted-foreground" },
  message: { tag: "FINDING", className: "border-phosphor/40 text-phosphor" },
};

const AGENT_STATE_LABEL: Record<AgentState["status"], string> = {
  investigating: "Investigating",
  awaiting_approval: "Waiting on you",
  done: "Standing by",
  error: "Stopped",
};

function StatusBadge({ status }: { status: AgentState["status"] }) {
  const live = status === "investigating";
  return (
    <span className="inline-flex items-center gap-2 rounded-sm border border-border bg-panel/95 px-3 py-1.5 font-mono text-[11px] tracking-widest">
      <span
        className={`size-1.5 rounded-full ${
          status === "awaiting_approval"
            ? "bg-primary"
            : status === "error"
              ? "bg-signal"
              : status === "done"
                ? "bg-phosphor"
                : "bg-amber"
        } ${live ? "motion-safe:animate-pulse" : ""}`}
        aria-hidden
      />
      {AGENT_STATE_LABEL[status].toUpperCase()}
    </span>
  );
}

function Step({ step, index }: { step: TimelineStep; index: number }) {
  const [open, setOpen] = useState(false);
  const style = KIND_STYLE[step.kind];
  const expandable = Boolean(step.result || (step.detail && step.kind !== "message"));

  return (
    <li className="relative border-l border-border pl-6">
      <span
        className={`absolute -left-[5px] top-2 size-2.5 rounded-full border-2 border-background ${
          step.failed
            ? "bg-signal"
            : step.kind === "guarded"
              ? "bg-primary"
              : step.kind === "message"
                ? "bg-phosphor"
                : "bg-muted-foreground"
        }`}
        aria-hidden
      />
      <div className="pb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="font-medium">{step.label}</span>
          <span
            className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] tracking-widest ${style.className}`}
          >
            {style.tag}
          </span>
          {step.failed && (
            <span className="font-mono text-[10px] tracking-widest text-signal">
              FAILED
            </span>
          )}
        </div>

        {step.kind === "message" ? (
          <AgentNote text={step.detail ?? ""} />
        ) : (
          step.detail && (
            <p className="mt-1.5 max-w-3xl truncate font-mono text-xs text-muted-foreground">
              {step.detail}
            </p>
          )
        )}

        {expandable && (
          <>
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground transition-colors hover:text-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {open ? "HIDE DETAIL" : "SHOW DETAIL"}
            </button>
            {open && (
              <pre className="mt-2 max-h-72 max-w-3xl overflow-auto rounded-md border border-border bg-panel/95 p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                {step.kind === "sandbox" && step.detail ? `$ ${step.detail}\n\n` : ""}
                {step.result ?? "No output recorded."}
              </pre>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function ApprovalConsole({
  state,
  busy,
  onDecide,
}: {
  state: AgentState;
  busy: boolean;
  onDecide: (decision: "allow" | "deny") => void;
}) {
  const pending = state.pending;
  if (!pending) return null;
  const args = Object.entries(pending.args ?? {}).filter(
    ([key]) => key !== "reason" && key !== "resolution",
  );

  return (
    <div
      role="alertdialog"
      aria-labelledby="clearance-title"
      className="sticky bottom-6 mt-2 rounded-md border border-primary/50 bg-panel p-6 shadow-[0_0_60px_-15px_rgba(255,178,36,0.35)]"
    >
      <p className="font-mono text-[11px] tracking-[0.3em] text-primary">
        CLEARANCE REQUESTED
      </p>
      <h3 id="clearance-title" className="mt-2 font-heading text-2xl">
        Mayday wants to run{" "}
        <span className="font-mono text-primary">{pending.tool}</span>
      </h3>

      {pending.reason && (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/85">
          {pending.reason}
        </p>
      )}

      {args.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs">
          {args.map(([key, value]) => (
            <div key={key}>
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="mt-0.5 text-foreground">
                {typeof value === "string" ? value : JSON.stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-4 font-mono text-[11px] tracking-wider text-signal">
        This changes live system state. Nothing has run yet.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          className="bg-flare px-5 font-semibold text-white hover:opacity-90"
          disabled={busy}
          onClick={() => onDecide("allow")}
        >
          {busy ? "Sending…" : "Approve"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onDecide("deny")}>
          Deny
        </Button>
      </div>
    </div>
  );
}

export function Investigation({
  incidentId,
  incidentStatus,
  initialSessionId,
}: {
  incidentId: string;
  incidentStatus: string;
  /** Resume a specific run — a shareable link to an investigation in flight. */
  initialSessionId?: string;
}) {
  const [started, setStarted] = useState<string | null>(null);
  const [state, setState] = useState<AgentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // An investigation outlives the tab, so a reload picks the session back up.
  // Private windows can refuse storage; the page still works without it.
  const saved = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return window.localStorage.getItem(SESSION_KEY(incidentId));
      } catch {
        return null;
      }
    },
    () => null,
  );

  const sessionId = started ?? initialSessionId ?? saved;
  const resumed = !started && Boolean(initialSessionId ?? saved);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const next = await getAgentState(sessionId);
        if (cancelled) return;
        setState(next);
        setError(null);
        if (next.status === "investigating") timer = setTimeout(poll, POLL_MS);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Lost contact with the agent.");
        timer = setTimeout(poll, POLL_MS * 2);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId, busy]);

  const begin = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { sessionId: id } = await startInvestigation(incidentId);
      try {
        window.localStorage.setItem(SESSION_KEY(incidentId), id);
      } catch {
        // Storage is a convenience here, not a requirement.
      }
      setStarted(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the agent.");
    } finally {
      setBusy(false);
    }
  }, [incidentId]);

  const decide = useCallback(
    async (decision: "allow" | "deny") => {
      if (!state?.pending || !sessionId) return;
      setBusy(true);
      setError(null);
      try {
        await decideApproval({
          sessionId,
          threadId: state.pending.threadId,
          toolCallId: state.pending.toolCallId,
          decision,
        });
        setState({ ...state, status: "investigating", pending: null });
      } catch (err) {
        setError(err instanceof Error ? err.message : "The decision did not go through.");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, state],
  );

  useEffect(() => {
    if (state?.status === "awaiting_approval") {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [state?.status]);

  if (!sessionId) {
    return (
      <div className="mt-10 rounded-md border border-border bg-panel/95 p-8">
        <h2 className="font-heading text-2xl">
          {incidentStatus === "resolved" ? "Reopen the investigation" : "Hand it to Mayday"}
        </h2>
        <p className="mt-2 max-w-lg text-muted-foreground">
          Mayday pulls the metrics, logs and deploy history for this service,
          runs its diagnostics in a sandbox, and comes back with one proposed
          fix. Nothing changes until you approve it.
        </p>
        {error && <p className="mt-4 font-mono text-xs text-signal">{error}</p>}
        <Button
          className="mt-6 bg-flare px-5 font-semibold text-white hover:opacity-90"
          disabled={busy}
          onClick={begin}
        >
          {busy ? "Dispatching…" : "Start investigation"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">Agent timeline</h2>
        <div className="flex items-center gap-3">
          {state && <StatusBadge status={state.status} />}
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
            {state?.steps.length ?? 0} STEPS
          </span>
        </div>
      </div>

      {resumed && (
        <p className="mt-3 font-mono text-[11px] tracking-wider text-muted-foreground">
          Session resumed — the investigation kept running while you were away.
        </p>
      )}
      {error && <p className="mt-3 font-mono text-xs text-signal">{error}</p>}
      {state?.error && (
        <p className="mt-3 max-w-3xl font-mono text-xs text-signal">{state.error}</p>
      )}

      {state && state.steps.length === 0 && state.status === "investigating" && (
        <p className="mt-6 font-mono text-sm text-muted-foreground">
          Mayday is reading the incident…
        </p>
      )}

      <ol className="mt-6">
        {state?.steps.map((step, index) => (
          <Step key={`${step.id}-${index}`} step={step} index={index} />
        ))}
      </ol>

      {state && (
        <ApprovalConsole state={state} busy={busy} onDecide={decide} />
      )}
      <div ref={endRef} />
    </div>
  );
}
