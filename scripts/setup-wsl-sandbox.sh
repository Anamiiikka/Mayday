#!/usr/bin/env bash
# Prepare a WSL Ubuntu host to run TrueForge with a working local sandbox.
#
# Run as root inside WSL:  sudo bash scripts/setup-wsl-sandbox.sh
#
# TrueForge's local sandbox provider is Linux/macOS only, so on Windows the
# harness has to run inside WSL. Three things have to be true before the
# sandbox can execute a single line of agent-written code:
#
#   1. bwrap, socat and rg must be on PATH — the sandbox runtime shells out
#      to them to build the isolation.
#   2. python3-venv must be installed. Ubuntu ships python3 without ensurepip,
#      so the sandbox fails at "virtual environment was not created
#      successfully" before it ever reaches your code.
#   3. pip must be able to install pydantic into that venv *without network
#      access*. The sandbox routes egress through a filtering proxy that does
#      not work under WSL, so every install attempt dies on ProxyError. We
#      stage the wheels in /usr/local/share (one of the few paths the sandbox
#      is allowed to read) and point pip at them with no-index, so the install
#      resolves locally and never touches the proxy.
set -euo pipefail

WHEELS=/usr/local/share/tf-wheels
PYDANTIC_PIN="pydantic>=2.0.0,<3.0.0"

echo "==> Installing sandbox host dependencies"
apt-get update -qq
apt-get install -y -qq bubblewrap socat ripgrep python3-venv python3-pip

echo "==> Staging $PYDANTIC_PIN wheels in $WHEELS"
mkdir -p "$WHEELS"
pip3 download "$PYDANTIC_PIN" -d "$WHEELS" -q

echo "==> Pointing pip at the local wheels (bypasses the sandbox egress proxy)"
cat > /etc/pip.conf <<EOF
[global]
no-index = true
find-links = $WHEELS
disable-pip-version-check = true
EOF

echo "==> Verifying a sandbox-style venv can be built offline"
rm -rf /tmp/tf-venv-check
python3 -m venv /tmp/tf-venv-check
/tmp/tf-venv-check/bin/pip install --quiet "$PYDANTIC_PIN"
rm -rf /tmp/tf-venv-check

cat <<'EOF'

Done. Start the harness with:

    SERVER_EXECUTION_TIMEOUT_SECONDS=1800 npx @truefoundry/trueforge

Then point the MCP server at the backend. WSL cannot reach the Windows host on
localhost, so use the host address from `ip route show default`, for example:

    http://172.25.208.1:4000/mcp

EOF
