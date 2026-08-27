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

if ! sudo service postgresql status >/dev/null 2>&1; then
  # Only present when the codespace fell back to a local database.
  sudo service postgresql start >/dev/null 2>&1 || true
fi

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
  local what=$1 path=$2
  shift 2
  local code
  code=$(curl -s -o "$LOGS/$what.json" -w '%{http_code}' \
    -X POST "http://localhost:8790/api/v1$path" \
    -H 'Content-Type: application/json' "$@")
  if [[ $code == 2* ]]; then
    echo "    registered $what"
  else
    echo "    $what not registered (HTTP $code) — already present, or:"
    sed 's/^/      /' "$LOGS/$what.json"
  fi
}

echo "==> Registering harness configuration"
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  register model-provider /settings/model-providers --data @- <<JSON
{"manifest":{"type":"google-gemini","auth":{"api_key":"$GEMINI_API_KEY"},
 "models":[{"model_id":"gemini-3.5-flash-lite","name":"gemini-3-5-flash-lite",
 "properties":{"context_length":1048576,"max_output_tokens":65536}}]}}
JSON
else
  echo "    no GEMINI_API_KEY secret — add one and re-run this script to"
  echo "    register a model, or the agent has nothing to think with"
fi

register mcp-server /settings/mcp-servers --data @- <<'JSON'
{"manifest":{"type":"remote","name":"mayday-fake-cloud","url":"http://localhost:4000/mcp",
 "description":"Mayday simulated cloud: read-only telemetry and approval-gated actions."}}
JSON

register agent /agents --data-binary @trueforge/agent.json

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
