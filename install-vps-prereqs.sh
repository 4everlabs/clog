#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND="${DEBIAN_FRONTEND:-noninteractive}"
INSTALL_GH_CLI="${INSTALL_GH_CLI:-1}"
INSTALL_SLACK_CLI="${INSTALL_SLACK_CLI:-0}"

sudo apt-get update
sudo apt-get install -y \
  ca-certificates \
  curl \
  git \
  unzip \
  jq \
  ripgrep \
  sqlite3 \
  build-essential \
  pkg-config

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.com/install | bash
fi

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$HOME/.local/bin:$PATH"
mkdir -p "$HOME/.local/bin"

if ! rg -q 'BUN_INSTALL=' "$HOME/.bashrc" 2>/dev/null; then
  cat >> "$HOME/.bashrc" <<'EOF'
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$HOME/.local/bin:$PATH"
EOF
fi

bun --version
bun --revision

cat > "$HOME/.local/bin/posthog-cli" <<'EOF'
#!/usr/bin/env bash
exec bunx @posthog/cli "$@"
EOF
chmod +x "$HOME/.local/bin/posthog-cli"

posthog-cli --help >/dev/null 2>&1 || true

if [ "$INSTALL_GH_CLI" = "1" ] && ! command -v gh >/dev/null 2>&1; then
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | sudo tee /usr/share/keyrings/githubcli-archive-keyring.gpg >/dev/null
  sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y gh
fi

if [ "$INSTALL_SLACK_CLI" = "1" ] && ! command -v slack >/dev/null 2>&1; then
  curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash
fi

echo "Finished installing prerequisites."
echo "Open a new shell or run: source ~/.bashrc"
