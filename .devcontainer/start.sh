#!/usr/bin/env bash
# Bring the whole stack up: database, backend, harness, Command Room.
# Runs as postStartCommand, and is safe to run by hand at any time — anything
# already listening is left alone.
set -euo pipefail
cd "$(dirname "$0")/.."

LOGS=/tmp/mayday
mkdir -p "$LOGS"

listening() { curl -sf -o /dev/null --max-time 2 "$1"; }

wait_for() {
  local url=$1 name=$2 secs=${3:-90}
  for ((i = 0; i < secs; i++)); do
    if listening "$url"; then return 0; fi
    sleep 1
  done
  echo "!! $name never came up. Log: $LOGS/$name.log" >&2
  return 1
}

# Only present when the codespace fell back to a local database. Starting an
# already-running cluster is a no-op, so this needs no guard.
sudo -n service postgresql start >/dev/null 2>&1 || true

echo "==> Seeding the fake cloud"
# Telemetry is written relative to now(), so every start gets fresh data and
# the demo incident is always 15 minutes old.
npm --prefix backend run seed

if listening http://localhost:4000/health; then
  echo "==> Backend already running"
else
  echo "==> Starting the backend on :4000"
  nohup npm --prefix backend run dev >"$LOGS/backend.log" 2>&1 &
  wait_for http://localhost:4000/health backend 60
fi

if listening http://localhost:8790/api/v1/agents; then
  echo "==> Harness already running"
else
  echo "==> Starting TrueForge on :8790"
  # Installed globally at setup; npx is the fallback if that ever fails.
  harness=$(command -v trueforge || echo "npx -y @truefoundry/trueforge")
  # Run it out of its own directory so its state never lands in the worktree.
  mkdir -p "$HOME/.mayday-harness"
  (cd "$HOME/.mayday-harness" &&
   SERVER_EXECUTION_TIMEOUT_SECONDS=1800 nohup $harness >"$LOGS/trueforge.log" 2>&1 &)
  wait_for http://localhost:8790/api/v1/agents trueforge 90
fi

register() {
  local what=$1 method=$2 path=$3
  shift 3
  local code
  code=$(curl -s -o "$LOGS/$what.json" -w '%{http_code}' \
    -X "$method" "http://localhost:8790/api/v1$path" \
    -H 'Content-Type: application/json' "$@")
  if [[ $code == 2* ]]; then
    echo "    registered $what"
  else
    echo "    $what not registered (HTTP $code) — already present, or:"
    # The response body carries no trailing newline; without one it runs into
    # whatever the next step prints.
    sed 's/^/      /' "$LOGS/$what.json"
    echo
  fi
}

echo "==> Registering harness configuration"
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  register model-provider PUT /settings/model-providers --data @- <<JSON
{"manifest":{"type":"google-gemini","auth":{"api_key":"$GEMINI_API_KEY"},
 "models":[{"model_id":"gemini-3.5-flash-lite","name":"gemini-3-5-flash-lite",
 "properties":{"context_length":1048576,"max_output_tokens":65536}}]}}
JSON
else
  echo "    no GEMINI_API_KEY secret — add one and re-run this script to"
  echo "    register a model, or the agent has nothing to think with"
fi

# The backend rejects /mcp without this bearer token, so the harness is the only
# caller that reaches the tools. Without it anyone who can reach port 4000 could
# invoke a destructive tool directly and walk straight past the approval gate.
MCP_TOKEN="$(grep -E '^MCP_TOKEN=' backend/.env | cut -d= -f2- || true)"
if [[ -z "$MCP_TOKEN" ]]; then
  echo "    !! backend/.env has no MCP_TOKEN — /mcp will accept unauthenticated"
  echo "       calls. Re-run .devcontainer/setup.sh to generate one."
fi
register mcp-server PUT /settings/mcp-servers --data @- <<JSON
{"manifest":{"type":"remote","name":"mayday-fake-cloud","url":"http://localhost:4000/mcp",
 "description":"Mayday simulated cloud: read-only telemetry and approval-gated actions.",
 "auth":{"type":"header","headers":{"Authorization":"Bearer $MCP_TOKEN"}}}}
JSON

# POST only ever creates. The SOP changes between runs, so an agent registered
# earlier would keep an old manifest forever and quietly ignore every later
# edit — the failure is silent, which is the worst kind. Update in place when it
# already exists; PUT is keyed by the server's id, not the name, and its body is
# the manifest alone.
AGENT_NAME="$(node -p "require('./trueforge/agent.json').name")"
AGENT_ID="$(curl -s "http://localhost:8790/api/v1/agents" | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
    const rows = JSON.parse(raw || "{}").data ?? [];
    const found = rows.find((row) => row.name === process.argv[1]);
    process.stdout.write(found ? found.id : "");
  });' "$AGENT_NAME" || true)"

if [[ -n "$AGENT_ID" ]]; then
  node -e "process.stdout.write(JSON.stringify({ manifest: require('./trueforge/agent.json').manifest }))"     > "$LOGS/agent-manifest.json"
  register agent PUT "/agents/$AGENT_ID" --data-binary @"$LOGS/agent-manifest.json"
else
  register agent POST /agents --data-binary @trueforge/agent.json
fi

if listening http://localhost:3000; then
  echo "==> Command Room already running"
else
  echo "==> Starting the Command Room on :3000"
  nohup npm --prefix frontend run dev -- --hostname 0.0.0.0 \
    >"$LOGS/frontend.log" 2>&1 &
  wait_for http://localhost:3000 frontend 90
fi

cat <<'EOF'

Mayday is up. Open port 3000 from the Ports tab, scroll to the Command Room,
and investigate INC-0042.

Logs live in /tmp/mayday/. Re-run this script after any restart.
EOF
