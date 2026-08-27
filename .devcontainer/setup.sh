#!/usr/bin/env bash
# One-time codespace preparation: sandbox host deps, a database, env files,
# and dependencies. Runs as postCreateCommand. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCAL_DB="postgres://mayday:mayday@localhost:5432/mayday"

echo "==> Sandbox host dependencies"
sudo bash scripts/setup-sandbox-host.sh

echo "==> TrueForge harness"
sudo npm install -g @truefoundry/trueforge

if [[ -n "${NEON_DATABASE_URL:-}" ]]; then
  echo "==> Using the Neon database from the NEON_DATABASE_URL secret"
  DB_URL="$NEON_DATABASE_URL"
else
  echo "==> No NEON_DATABASE_URL secret; installing a local Postgres instead"
  sudo apt-get install -y -qq postgresql
  sudo service postgresql start
  # Both statements are idempotent so a rebuild does not fail here.
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='mayday'" \
    | grep -q 1 || sudo -u postgres psql -q \
      -c "CREATE ROLE mayday LOGIN PASSWORD 'mayday' SUPERUSER"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='mayday'" \
    | grep -q 1 || sudo -u postgres createdb -O mayday mayday
  DB_URL="$LOCAL_DB"
fi

# One shared operator token, generated once and reused on rebuilds so the two
# env files can never drift apart.
if [[ -f backend/.env ]]; then
  OPERATOR_TOKEN="$(grep -E '^OPERATOR_TOKEN=' backend/.env | cut -d= -f2-)"
fi
OPERATOR_TOKEN="${OPERATOR_TOKEN:-$(openssl rand -hex 24)}"

echo "==> Writing env files"
cat > backend/.env <<ENV
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
NEON_DATABASE_URL=$DB_URL
TRUEFORGE_BASE_URL=http://localhost:8790
TRUEFORGE_AGENT=incident-responder
MCP_TOKEN=
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
