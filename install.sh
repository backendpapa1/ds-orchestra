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
INSTALL_DIR="${DS_INSTALL_DIR:-$HOME/.ds-orchestra}"
SRC_DIR="$INSTALL_DIR/src"
mkdir -p "$INSTALL_DIR"

# Determine version tag for download
if [ "$DS_VERSION" = "latest" ]; then
  DOWNLOAD_TAG="v1.0"  # fallback — replace with API call for real latest
else
  DOWNLOAD_TAG="$DS_VERSION"
fi

# Download and extract the release source tarball
TARBALL_URL="https://github.com/backendpapa1/ds-orchestra/archive/refs/tags/${DOWNLOAD_TAG}.tar.gz"
log "Downloading ds-orchestra ${DOWNLOAD_TAG}..."
curl -fsSL "$TARBALL_URL" | tar -xz -C "$INSTALL_DIR" --strip-components=1 2>/dev/null

if [ ! -f "$INSTALL_DIR/package.json" ]; then
  err "Download failed or tarball is missing package.json."
  err "URL: $TARBALL_URL"
  exit 1
fi

# Install dependencies and build
log "Installing dependencies..."
cd "$INSTALL_DIR"
npm install 2>&1 | tail -1

log "Building..."
npx tsc -p tsconfig.build.json 2>&1

# Link binaries globally (uses the "bin" field in package.json)
log "Linking binaries..."
npm link 2>&1

# ── Verify binary ──────────────────────────────────────────────────
NPM_PREFIX="$(npm prefix -g 2>/dev/null || echo '/usr/local')"
export PATH="$NPM_PREFIX/bin:$PATH"

if command -v ds-orchestra &>/dev/null; then
  VER="$(ds-orchestra --version 2>/dev/null || echo 'unknown')"
  log "Binary verified: ds-orchestra $VER"
else
  err "Binary not found on PATH."
  err "Add this to your shell rc file:"
  err "  export PATH=\"$NPM_PREFIX/bin:\$PATH\""
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
    warn "Save it with:"
    warn "  ds-orchestra config set api_key sk-your-key-here"
  else
    warn "DEEPSEEK_API_KEY is not set. The MCP server will fail to start."
    warn "Save it with: ds-orchestra config set api_key sk-your-key-here"
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
