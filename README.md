
### On every pull request
| Job | What it does |
|---|---|
| `frontend` | `eslint` and a production `next build` |
| `backend` | `tsc --noEmit` over source *and* tests, `npm test`, then a build |
### What the tests pin down
The unit tests (`node:test`, no framework) cover the two pieces of logic that decide whether the
approval gate holds — both of which had real bugs caught in review:
- **`chooseRollbackTarget`** — the one piece of judgement in an otherwise mechanical tool, and it
  runs *after* a human has approved the action. Tested for the double-rollback case (backing out
  twice must not reinstate the release just backed out of), unknown versions, no history, a target
  already running, and an explicitly named version being honoured as given.
- **`resolvePending`** — what the operator is actually being asked to clear. Tested for a resumed
  turn no longer showing its old pause, and for naming the tool correctly when Code Mode kept the
  call off the timeline. That second case is the "Mayday wants to run *unknown*" regression.
Alongside those, `buildTimeline` is tested for pairing calls with responses, classifying tools by
how much trust they need, hiding harness bookkeeping, unwrapping `call_tool`, flagging refusals,
and putting sub-agent work in its own lane.
```bash
cd backend && npm test     # 20 tests, no database required
```
The database-backed tool paths themselves are covered by the end-to-end run rather than by unit
tests — see [known limitations](#known-limitations).
---
## Qodo code review evidence
Every change went through a pull request reviewed by [Qodo](https://qodo.ai) before merging, per the
hackathon's code-review requirement. **Twenty-three findings across seven pull requests**, all fixed
before merge except one dismissed on purpose. The fix commits are in the history under `Address review:`.
| PR | Found | What review caught |
|---|---|---|
| [#2](https://github.com/Anamiiikka/Mayday/pull/2) | 1 | Static font weights loaded where a variable axis was intended |
| [#3](https://github.com/Anamiiikka/Mayday/pull/3) | 1 | Folding the dashboard into the landing page deleted `/command-room` outright, 404-ing every existing link. Now redirects to the embedded section |
| [#4](https://github.com/Anamiiikka/Mayday/pull/4) | 8 | The heaviest round, and all of it in the tools: mutations and the seed were non-atomic, so a late failure left the fake cloud half-changed; `restart_service` and `resolve_incident` reported success for services and incidents that did not exist; `rollback_deployment` accepted any version string and activated it unchecked; audit rows attached to the wrong incident; `/mcp` was reachable without auth |
| [#5](https://github.com/Anamiiikka/Mayday/pull/5) | 2 | Telemetry was ordered by a *formatted clock string*, so buckets and log ranges crossing midnight came back reversed and undated. The agent would have read the sequence backwards and diagnosed from it |
| [#6](https://github.com/Anamiiikka/Mayday/pull/6) | 5 | Two rounds. Rollback could reinstate the release just backed out of; the agent, approval and reset routes were callable with no token at all; a backend outage rendered as a permanent 404 instead of something retryable; approval state was never written back, so the incident feed showed "Investigating" while a decision sat waiting |
| [#7](https://github.com/Anamiiikka/Mayday/pull/7) | 3 | Three places this README and the code disagreed — including approved-then-refused actions leaving no audit trail at all, because guarded handlers returned before recording anything |
| [#8](https://github.com/Anamiiikka/Mayday/pull/8) | 3 | The codespace generated an empty `MCP_TOKEN`, leaving `/mcp` unauthenticated and the approval gate bypassable by anything that could reach the port. A second round caught two more: reading a token out of an older `.env` aborted the whole build under `set -e` when the line was not there, and registering the agent with `POST` meant an agent from an earlier run silently kept its old SOP — every later edit ignored, with nothing to show for it |
Four of these were ways past the approval gate — #4's unauthenticated `/mcp`, #6's untokened
approval route and its rollback target, and #8's empty token — and none of them were visible from
the UI. #8's second round is the other kind worth having: two silent failures, one that would have
stopped a judge's codespace building and one that would have let it build and then run the wrong
agent.
#7 is worth reading for a different reason: review compared this file against the code and found
the code wanting, which is how the `refuse()` path that audits cleared-but-rejected actions came to
exist.
One finding was **dismissed rather than fixed**: #6 flagged that the sandbox setup script points
`pip` at staged wheels host-wide. That is true, and it is the only way the sandboxed `pip` can
resolve anything, because it does not inherit environment variables. The script backs up whatever
config was there, `--revert` restores it, and the header says so before you run it.
---
## Known limitations
Stated plainly, because a hackathon judge will find them anyway.
- **The tests stop at the database.** Pure decision logic is unit-tested; the transactional tool
  bodies are exercised only by the end-to-end run. Testing those properly means a Postgres service
  container in CI, which is the next thing worth building.
- **Session resume works but is silent.** The session id is persisted and state is re-read from the
  harness on load, so a reload mid-incident recovers the run. There is no banner announcing it.
- **The Command Room polls, it does not stream.** State is re-read every four seconds rather than
  consuming the harness's SSE feed. Simpler and resume-safe; up to four seconds behind.
- **`scale_service` is never exercised.** It is implemented, gated and audited like the other
  guarded tools, but neither seeded incident calls for it.
- **Delegation is not reliably concurrent.** The SOP asks for both `create_sub_agent` calls in one
  message. The model often issues them one after the other instead, which still gives two analysts
  on two threads — and two lanes in the timeline — but gathers the evidence in sequence.
- **Code Mode makes the timeline vary.** The model sometimes reaches MCP tools from inside its
  sandbox script rather than as top-level calls. The run is identical; the timeline shows sandbox
  steps instead of individual read steps.
- **Local sandbox only.** No Daytona provider is configured, so the host must permit unprivileged
  user namespaces — WSL2, a privileged codespace, or a VM you have root on.
---
## Status
Everything the demo depends on is built and running:
- [x] Landing page and Command Room
- [x] Simulated cloud: schema, seed, nine MCP tools
- [x] TrueForge agent: SOP, gated tools, sandbox
- [x] Live agent loop wired into the UI, with the approval round trip
- [x] Sandbox verified running agent-written Python under bubblewrap
- [x] One-click Codespaces environment
- [x] Sub-agent fan-out: metrics and log analysts on their own threads, rendered as lanes
- [x] Unit tests on the approval-gate decision logic
- [x] Two incident scenarios with different root causes and different right answers
- [x] Twenty-two of twenty-three review findings fixed; the twenty-third answered
      
Check it out at: 
YouTube: https://youtu.be/orimZ2KaBfQ
Dev.to: https://dev.to/anamika_singh_0156ca88596/i-built-an-ai-incident-responder-that-refuses-to-fix-anything-without-asking-7ld
