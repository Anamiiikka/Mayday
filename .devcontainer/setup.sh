#!/usr/bin/env bash
# One-time codespace preparation: sandbox host deps, a database, env files,
# and dependencies. Runs as postCreateCommand. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCAL_DB="postgres://mayday:mayday@localhost:5432/mayday"

echo "==> Sandbox host dependencies"
sudo -n bash scripts/setup-sandbox-host.sh

echo "==> TrueForge harness"
sudo -n npm install -g @truefoundry/trueforge

if [[ -n "${NEON_DATABASE_URL:-}" ]]; then
  echo "==> Using the Neon database from the NEON_DATABASE_URL secret"
  DB_URL="$NEON_DATABASE_URL"
else
  echo "==> No NEON_DATABASE_URL secret; installing a local Postgres instead"
  sudo -n apt-get install -y -qq postgresql
  sudo -n service postgresql start

  # Codespaces grants this user passwordless sudo for root only, so
  # `sudo -u postgres` would sit on a password prompt forever. Go via root.
  as_postgres() { sudo -n su postgres -c "$1"; }
  exists() { as_postgres "psql -tAc \"$1\"" | grep -q 1; }

  # Both checks are idempotent so a rebuild does not fail here.
  exists "SELECT 1 FROM pg_roles WHERE rolname='mayday'" ||
    as_postgres "psql -q -c \"CREATE ROLE mayday LOGIN PASSWORD 'mayday' SUPERUSER\""
  exists "SELECT 1 FROM pg_database WHERE datname='mayday'" ||
    as_postgres "createdb -O mayday mayday"
  DB_URL="$LOCAL_DB"
fi

# Tokens are generated once and reused on rebuilds, so the two env files can
# never drift apart and the harness keeps working against an existing
# registration. OPERATOR_TOKEN guards the agent routes; MCP_TOKEN guards /mcp
# itself, without which anyone who can reach port 4000 could invoke a
# destructive tool directly and walk straight past the approval gate.
if [[ -f backend/.env ]]; then
  OPERATOR_TOKEN="$(grep -E '^OPERATOR_TOKEN=' backend/.env | cut -d= -f2-)"
  MCP_TOKEN="$(grep -E '^MCP_TOKEN=' backend/.env | cut -d= -f2-)"
fi
OPERATOR_TOKEN="${OPERATOR_TOKEN:-$(openssl rand -hex 24)}"
MCP_TOKEN="${MCP_TOKEN:-$(openssl rand -hex 24)}"

echo "==> Writing env files"
cat > backend/.env <<ENV
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
NEON_DATABASE_URL=$DB_URL
TRUEFORGE_BASE_URL=http://localhost:8790
TRUEFORGE_AGENT=incident-responder
MCP_TOKEN=$MCP_TOKEN
OPERATOR_TOKEN=$OPERATOR_TOKEN
ENV
cat > frontend/.env.local <<ENV
API_URL=http://localhost:4000
OPERATOR_TOKEN=$OPERATOR_TOKEN
ENV

echo "==> Installing dependencies"
npm --prefix backend ci
npm --prefix frontend ci

echo
echo "Setup complete. The stack starts automatically; watch the Ports tab for"
echo "the Command Room on 3000. To drive it by hand: bash .devcontainer/start.sh"
