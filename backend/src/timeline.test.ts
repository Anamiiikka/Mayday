import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTimeline, resolvePending } from "./trueforge.js";

const AT = "2026-08-27T13:10:00.000Z";

function call(id: string, name: string, args: unknown) {
  return { id, function: { name, arguments: JSON.stringify(args) } };
}

function message(
  id: string,
  opts: { content?: string; calls?: ReturnType<typeof call>[]; thread?: string } = {},
) {
  return {
    type: "model.message",
    id,
    created_at: AT,
    thread_id: opts.thread ?? "main",
    content: opts.content,
    tool_calls: opts.calls,
  };
}

function response(callId: string, content: unknown, thread = "main") {
  return {
    type: "tool.response",
    id: `resp-${callId}`,
    created_at: AT,
    thread_id: thread,
    tool_call_id: callId,
    content,
  };
}

describe("buildTimeline", () => {
  it("pairs a tool call with the response that came back", () => {
    const { steps } = buildTimeline([
      message("m1", { calls: [call("c1", "query_metrics", { service: "checkout-api" })] }),
      response("c1", { samples: [] }),
    ]);
    assert.equal(steps.length, 1);
    assert.equal(steps[0]!.label, "query_metrics");
    assert.equal(steps[0]!.kind, "read");
    assert.match(steps[0]!.result!, /samples/);
    assert.equal(steps[0]!.failed, false);
  });

  it("labels each tool by how much trust it needs", () => {
    const { steps } = buildTimeline([
      message("m1", {
        calls: [
          call("c1", "search_logs", { service: "checkout-api" }),
          call("c2", "rollback_deployment", { service: "checkout-api" }),
          call("c3", "exec", { command: "python3 -c 'print(1)'" }),
          call("c4", "create_sub_agent", { name: "metrics-analyst", input: "gather telemetry" }),
        ],
      }),
    ]);
    assert.deepEqual(
      steps.map((step) => step.kind),
      ["read", "guarded", "sandbox", "subagent"],
    );
  });

  it("leaves harness bookkeeping out of the operator's view", () => {
    const { steps } = buildTimeline([
      message("m1", {
        calls: [call("c1", "list_tools", {}), call("c2", "get_current_datetime", {})],
      }),
    ]);
    assert.deepEqual(steps, []);
  });

  it("unwraps a tool the agent reached through call_tool", () => {
    const { steps, callInfo } = buildTimeline([
      message("m1", {
        calls: [
          call("c1", "call_tool", {
            tool_name: "rollback_deployment",
            input: { service: "checkout-api", to_version: "v1.4.1" },
          }),
        ],
      }),
    ]);
    assert.equal(steps[0]!.label, "rollback_deployment");
    assert.equal(steps[0]!.kind, "guarded");
    assert.deepEqual(callInfo.get("c1")!.args, {
      service: "checkout-api",
      to_version: "v1.4.1",
    });
  });

  it("marks a refused tool result as failed", () => {
    const { steps } = buildTimeline([
      message("m1", { calls: [call("c1", "rollback_deployment", { service: "ghost" })] }),
      response("c1", '{"error":"Unknown service \\"ghost\\"."}'),
    ]);
    assert.equal(steps[0]!.failed, true);
  });

  it("puts sub-agent work in its own lane", () => {
    const { steps } = buildTimeline([
      message("m1", { calls: [call("c1", "create_sub_agent", { name: "log-analyst", input: "x" })] }),
      message("m2", {
        thread: "thread-log-analyst",
        calls: [call("c2", "search_logs", { service: "checkout-api" })],
      }),
      message("m3", { thread: "thread-log-analyst", content: "Pool exhaustion, 40 occurrences." }),
      message("m4", { content: "Correlated with v1.4.2." }),
    ]);
    assert.equal(steps[0]!.lane, undefined);
    assert.equal(steps[1]!.lane, "thread-log-analyst");
    assert.equal(steps[2]!.label, "Sub-agent");
    assert.equal(steps[3]!.label, "Agent");
    assert.equal(steps[3]!.lane, undefined);
  });

  it("surfaces the reason a turn ended in error", () => {
    const { error } = buildTimeline([
      { type: "turn.done", id: "t1", created_at: AT, state: { status: "error", message: "429" } },
    ]);
    assert.equal(error, "429");
  });
});

describe("resolvePending", () => {
  const approval = (callId: string, name: string, args: unknown) => ({
    type: "tool.approval_required",
    id: "a1",
    created_at: AT,
    thread_id: "main",
    tool_calls: [call(callId, name, args)],
  });

  it("names the tool from the timeline when the call is in it", () => {
    const info = new Map([
      ["c1", { name: "rollback_deployment", args: { service: "checkout-api", reason: "bad deploy" } }],
    ]);
    const pending = resolvePending(
      { required_actions: [approval("c1", "ignored", {})] },
      info,
      false,
    );
    assert.equal(pending!.tool, "rollback_deployment");
    assert.equal(pending!.reason, "bad deploy");
    assert.equal(pending!.toolCallId, "c1");
    assert.equal(pending!.threadId, "main");
  });

  it("names the tool from the action itself when Code Mode kept it off the timeline", () => {
    // The regression this covers: the agent called the tool from inside a
    // sandbox script, the call never reached the timeline, and the operator was
    // asked to approve "unknown".
    const pending = resolvePending(
      {
        required_actions: [
          approval("c9", "rollback_deployment", { service: "checkout-api", reason: "pool leak" }),
        ],
      },
      new Map(),
      false,
    );
    assert.equal(pending!.tool, "rollback_deployment");
    assert.equal(pending!.reason, "pool leak");
  });

  it("shows nothing while the turn is running", () => {
    // A resumed turn supersedes the approval that started it; leaving the pause
    // on screen would invite a second click on an action already cleared.
    const pending = resolvePending(
      { status: "running", required_actions: [approval("c1", "rollback_deployment", {})] },
      new Map(),
      true,
    );
    assert.equal(pending, null);
  });

  it("reads resolve_incident's summary as the reason", () => {
    const pending = resolvePending(
      {
        required_actions: [
          approval("c1", "resolve_incident", { id: "INC-0042", resolution: "Rolled back." }),
        ],
      },
      new Map(),
      false,
    );
    assert.equal(pending!.reason, "Rolled back.");
  });

  it("returns nothing when the turn is waiting on something else", () => {
    const pending = resolvePending(
      { required_actions: [{ type: "user.question", id: "q1", created_at: AT }] },
      new Map(),
      false,
    );
    assert.equal(pending, null);
  });
});
