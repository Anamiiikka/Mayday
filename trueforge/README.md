# TrueForge setup

Mayday's agent runs on [TrueForge](https://trueforge.dev). This directory holds the agent
definition so a fresh machine can reproduce the demo. No secrets are stored here — you bring
your own model key.

## 1. Run the harness

TrueForge needs Linux. On Windows, run it inside WSL (the local sandbox is Linux/macOS only):

```bash
# inside WSL Ubuntu, as root
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
apt-get install -y bubblewrap socat ripgrep     # sandbox dependencies
SERVER_EXECUTION_TIMEOUT_SECONDS=1800 npx @truefoundry/trueforge
```

Add `networkingMode=mirrored` under `[wsl2]` in `%USERPROFILE%\.wslconfig` so WSL and Windows
share `localhost`; without it the harness cannot reach the backend's MCP server on port 4000.

TrueForge serves its own chat UI and API on http://localhost:8790.

## 2. Configure a model provider

Settings → Models, or via the API. Any provider works, but free tiers are tight — the agent
makes 10–20 model calls per investigation, so per-minute request caps matter more than price:

| Provider | Verdict |
| --- | --- |
| Google Gemini (`gemini-3.5-flash-lite`) | **Recommended.** Fast, reliable tool calling, enough free headroom to finish a run. |
| Groq | Free tier caps 8,000 tokens/min — roughly two calls per minute. Not enough for an agent loop. |
| NVIDIA NIM | `llama-3.3-70b` and `deepseek-v4-flash` work but take 30–40s per call; `gpt-oss-120b` hangs on tool-call history. |

```bash
curl -X POST http://localhost:8790/api/v1/settings/model-providers \
  -H 'Content-Type: application/json' \
  -d '{"manifest":{"type":"google-gemini","auth":{"api_key":"YOUR_KEY"},
       "models":[{"model_id":"gemini-3.5-flash-lite","name":"gemini-3-5-flash-lite",
       "properties":{"context_length":1048576,"max_output_tokens":65536}}]}}'
```

## 3. Register the fake cloud and the agent

With the backend running (`cd backend && npm run seed && npm run dev`):

```bash
curl -X POST http://localhost:8790/api/v1/settings/mcp-servers \
  -H 'Content-Type: application/json' \
  -d '{"manifest":{"type":"remote","name":"mayday-fake-cloud","url":"http://localhost:4000/mcp",
       "description":"Mayday simulated cloud: read-only telemetry and approval-gated actions."}}'

curl -X POST http://localhost:8790/api/v1/agents \
  -H 'Content-Type: application/json' --data-binary @trueforge/agent.json
```

## How the approval gate works

`agent.json` lists the four state-changing tools under `require_approval_for_tools`. When the
agent calls one, the turn ends with `status: done` and a `required_actions` entry of type
`tool.approval_required`. Nothing has run at that point. The operator resumes it by posting a
new turn:

```json
{ "input": [{ "type": "user.tool_approval", "thread_id": "main",
              "tool_call_id": "<id from required_actions>",
              "approval": { "status": "allow" } }] }
```

`"status": "deny"` refuses instead, and the agent proposes alternatives rather than retrying.

A full investigation takes three rounds: propose the fix → approve → verify and propose
resolution → approve → final report.
