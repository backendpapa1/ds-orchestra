#!/usr/bin/env bash
# ds-orchestra installer — single-command install
# curl -fsSL https://<host>/install.sh | bash
#
# Idempotent. Re-running upgrades in place; never duplicates MCP registration or PATH entries.
# Non-interactive by default when piped. Gate all prompts behind a tty check.
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[ds-orchestra]${NC} $*" >&2; }
warn() { echo -e "${YELLOW}[ds-orchestra]${NC} $*" >&2; }
err()  { echo -e "${RED}[ds-orchestra]${NC} $*" >&2; }

# ── Configuration ──────────────────────────────────────────────────
DS_VERSION="${DS_VERSION:-latest}"
DS_NO_MCP="${DS_NO_MCP:-0}"
DS_INSTALL_DIR="${DS_INSTALL_DIR:-}"
INSTALL_METHOD="npm"  # "npm" or "tarball"

# ── OS/Arch detection ──────────────────────────────────────────────
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64|amd64)  ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    err "Unsupported architecture: $ARCH"
    err "Supported: x86_64 (amd64), aarch64 (arm64)"
    exit 1
    ;;
esac

case "$OS" in
  linux|darwin) ;;
  *)
    err "Unsupported OS: $OS"
    err "Supported: linux, darwin (macOS)"
    exit 1
    ;;
esac

log "Detected: $OS / $ARCH"

# ── Node.js check ──────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  err "Node.js is required but not found."
  err "Install Node.js 20+ from https://nodejs.org or your package manager, then re-run this script."
  exit 1
fi

NODE_VERSION="$(node -v | sed 's/v//')"
NODE_MAJOR="$(echo "$NODE_VERSION" | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  err "Node.js 20+ required. Found: v$NODE_VERSION"
  err "Upgrade Node.js and re-run this script."
  exit 1
fi
log "Node.js v$NODE_VERSION detected"

# ── Install ────────────────────────────────────────────────────────
if command -v npm &>/dev/null; then
  log "Installing via npm..."
  if [ -n "$DS_INSTALL_DIR" ]; then
    npm install -g --prefix "$DS_INSTALL_DIR" "ds-orchestra@${DS_VERSION}"
  else
    npm install -g "ds-orchestra@${DS_VERSION}"
  fi
  INSTALL_METHOD="npm"
else
  warn "npm not found. Falling back to tarball install."
  INSTALL_DIR="${DS_INSTALL_DIR:-$HOME/.ds-orchestra/bin}"
  mkdir -p "$INSTALL_DIR"
  # Tarball URL would be set during publish
  TARBALL_URL="https://github.com/ds-orchestra/releases/download/v${DS_VERSION}/ds-orchestra-${OS}-${ARCH}.tar.gz"
  log "Downloading from $TARBALL_URL..."
  curl -fsSL "$TARBALL_URL" | tar -xz -C "$INSTALL_DIR"
  INSTALL_METHOD="tarball"

  # Add to PATH if not already there
  case "$SHELL" in
    */zsh) RC="$HOME/.zshrc" ;;
    */bash) RC="$HOME/.bashrc" ;;
    *) RC="$HOME/.profile" ;;
  esac

  if ! grep -q "$INSTALL_DIR" "$RC" 2>/dev/null; then
    echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$RC"
    log "Added $INSTALL_DIR to PATH in $RC"
    log "Restart your shell or run: source $RC"
  fi
fi

# ── Verify binary ──────────────────────────────────────────────────
if command -v ds-orchestra &>/dev/null; then
  VER="$(ds-orchestra --version 2>/dev/null || echo 'unknown')"
  log "Binary verified: ds-orchestra $VER"
else
  err "Binary 'ds-orchestra' not found on PATH after install."
  err "Install method: $INSTALL_METHOD"
  err "Check your PATH or re-run with DS_INSTALL_DIR set."
  exit 1
fi

# ── MCP Registration ───────────────────────────────────────────────
if [ "$DS_NO_MCP" = "0" ]; then
  if command -v claude &>/dev/null; then
    if claude mcp list 2>/dev/null | grep -q "ds-orchestra"; then
      log "MCP server already registered"
    else
      log "Registering MCP server..."
      if claude mcp add --scope user ds-orchestra -- ds-orchestra-mcp 2>/dev/null; then
        log "MCP server registered: claude mcp add ds-orchestra"
      else
        warn "Could not register MCP server. Run manually:"
        warn "  claude mcp add --scope user ds-orchestra -- ds-orchestra-mcp"
      fi
    fi
  else
    warn "'claude' not on PATH — skipping MCP registration."
    warn "Run this command after installing Claude Code:"
    warn "  claude mcp add --scope user ds-orchestra -- ds-orchestra-mcp"
  fi
fi

# ── API Key Prompt ─────────────────────────────────────────────────
if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  # Only prompt if we have a tty (non-interactive when piped)
  if [ -t 0 ]; then
    warn "DEEPSEEK_API_KEY is not set."
    warn "Get your key from https://platform.deepseek.com"
    warn ""
    warn "Add this to your shell rc file (~/.bashrc, ~/.zshrc):"
    warn "  export DEEPSEEK_API_KEY=sk-your-key-here"
    warn ""
    warn "Or set it inline before running ds-orchestra-mcp:"
    warn "  DEEPSEEK_API_KEY=sk-... ds-orchestra-mcp"
  else
    warn "DEEPSEEK_API_KEY is not set. The MCP server will fail to start."
    warn "Set it in your environment: export DEEPSEEK_API_KEY=sk-..."
  fi
fi

# ── Done ───────────────────────────────────────────────────────────
log ""
log "ds-orchestra installed successfully!"
log ""
log "Next step: cd your-repo && ds-orchestra init"
log ""

if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  warn "Reminder: set DEEPSEEK_API_KEY before using ds-orchestra"
fi
