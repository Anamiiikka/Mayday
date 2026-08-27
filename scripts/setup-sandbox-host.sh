#!/usr/bin/env bash
# Prepare a Linux host to run TrueForge with a working local sandbox.
#
# Run as root:  sudo bash scripts/setup-sandbox-host.sh
#
# TrueForge isolates agent-written code with bubblewrap, so the host needs a
# kernel that lets an unprivileged process create user and mount namespaces.
# That rules out Windows (use WSL2) and most managed container platforms, whose
# seccomp profiles deny CLONE_NEWUSER. Verified working: WSL2 Ubuntu, GitHub
# Codespaces, and any VM you have root on. Check a candidate host in seconds:
#
#     unshare -Ur echo ok
#     bwrap --unshare-all --ro-bind / / --dev /dev echo ok
#
# Two "ok"s and this script will finish the job. It fixes three things that
# each stop the sandbox before it executes a single line of agent code:
#
#   1. bwrap, socat and rg must be on PATH — the sandbox runtime shells out
#      to them to build the isolation.
#   2. python3-venv must be installed. Debian and Ubuntu ship python3 without
#      ensurepip, so the sandbox fails at "virtual environment was not created
#      successfully" before it ever reaches your code.
#   3. pip must be able to install pydantic into that venv *without network
#      access*. The sandbox routes egress through a filtering proxy that is not
#      reliably reachable off a plain host. We stage the wheels in
#      /usr/local/share (one of the few paths the sandbox is allowed to read)
#      and point pip at them with no-index, so the install resolves locally and
#      never touches the proxy.
#
# Step 3 has to be a global pip config: the sandboxed pip does not inherit
# environment variables, so PIP_CONFIG_FILE and PIP_NO_INDEX have no effect on
# it. That makes this host-wide, so the script backs up whatever was there and
# `--revert` puts it back:
#
#     sudo bash scripts/setup-sandbox-host.sh --revert
#
# Use a machine you are happy to dedicate to the demo.
set -euo pipefail

WHEELS=/usr/local/share/tf-wheels
PYDANTIC_PIN="pydantic>=2.0.0,<3.0.0"
PIP_CONF=/etc/pip.conf
BACKUP="$PIP_CONF.before-mayday"

if [[ "${1:-}" == "--revert" ]]; then
  if [[ -f "$BACKUP" ]]; then
    mv "$BACKUP" "$PIP_CONF"
    echo "Restored the previous $PIP_CONF."
  else
    rm -f "$PIP_CONF"
    echo "Removed $PIP_CONF; there was no earlier config to restore."
  fi
  rm -rf "$WHEELS"
  echo "Removed $WHEELS. Host pip can reach the package index again."
  exit 0
fi

echo "==> Installing sandbox host dependencies"
apt-get update -qq
apt-get install -y -qq bubblewrap socat ripgrep python3-venv python3-pip

echo "==> Staging $PYDANTIC_PIN wheels in $WHEELS"
mkdir -p "$WHEELS"
pip3 download "$PYDANTIC_PIN" -d "$WHEELS" -q

echo "==> Pointing pip at the local wheels (bypasses the sandbox egress proxy)"
if [[ -f "$PIP_CONF" && ! -f "$BACKUP" ]]; then
  cp "$PIP_CONF" "$BACKUP"
  echo "    Saved your existing $PIP_CONF to $BACKUP"
fi
cat > "$PIP_CONF" <<EOF
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

Done.

NOTE: pip on this host now installs only from the staged wheel directory, so
other Python work here will not reach the package index until you run this
script with --revert.

Start the harness with:

    SERVER_EXECUTION_TIMEOUT_SECONDS=1800 npx @truefoundry/trueforge

If the harness and the backend are on different hosts (WSL reaching a Windows
backend, say), point the MCP server at the reachable address rather than
localhost — `ip route show default` gives you the gateway.
EOF
