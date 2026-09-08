#!/usr/bin/env sh
# Diffrex macOS / Linux Installer & Uninstaller
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/zonuko/diffrex/main/scripts/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/zonuko/diffrex/main/scripts/install.sh | sh -s -- --uninstall
# Or:
#   DIFFREX_UNINSTALL=1 sh install.sh

set -e

REPO="zonuko/diffrex"
INSTALL_DIR="${DIFFREX_INSTALL_DIR:-$HOME/.local/share/diffrex}"
BIN_DIR="${DIFFREX_BIN_DIR:-$HOME/.local/bin}"

# Check for uninstall flag
IS_UNINSTALL=0
if [ "$1" = "--uninstall" ] || [ "$1" = "-u" ] || [ "$DIFFREX_UNINSTALL" = "1" ]; then
  IS_UNINSTALL=1
fi

if [ "$IS_UNINSTALL" = "1" ]; then
  echo "🦖 Uninstalling Diffrex..."
  if [ -L "$BIN_DIR/diffrex" ] || [ -f "$BIN_DIR/diffrex" ]; then
    rm -f "$BIN_DIR/diffrex"
    echo "  Removed $BIN_DIR/diffrex"
  fi
  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    echo "  Removed $INSTALL_DIR"
  fi
  echo "✨ Diffrex has been uninstalled."
  exit 0
fi

# Detect Operating System
OS="$(uname -s)"
case "$OS" in
  Darwin)
    PLATFORM_OS="macos"
    ;;
  Linux)
    PLATFORM_OS="linux"
    ;;
  *)
    echo "❌ Error: Unsupported operating system '$OS'." >&2
    echo "Diffrex installer supports macOS and Linux. For Windows, please use install.ps1." >&2
    exit 1
    ;;
esac

# Detect Architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)
    PLATFORM_ARCH="x86_64"
    ;;
  arm64|aarch64)
    if [ "$PLATFORM_OS" = "macos" ]; then
      PLATFORM_ARCH="aarch64"
    else
      echo "❌ Error: Pre-built binary for Linux aarch64 is not currently available." >&2
      exit 1
    fi
    ;;
  *)
    echo "❌ Error: Unsupported architecture '$ARCH'." >&2
    exit 1
    ;;
esac

ARTIFACT_NAME="diffrex-${PLATFORM_OS}-${PLATFORM_ARCH}"
ARCHIVE_NAME="${ARTIFACT_NAME}.tar.gz"

if [ -n "$DIFFREX_VERSION" ]; then
  DOWNLOAD_BASE_URL="https://github.com/${REPO}/releases/download/${DIFFREX_VERSION}"
  echo "🦖 Installing Diffrex (${DIFFREX_VERSION}) for ${PLATFORM_OS}-${PLATFORM_ARCH}..."
else
  DOWNLOAD_BASE_URL="https://github.com/${REPO}/releases/latest/download"
  echo "🦖 Installing the latest Diffrex for ${PLATFORM_OS}-${PLATFORM_ARCH}..."
fi

DOWNLOAD_URL="${DOWNLOAD_BASE_URL}/${ARCHIVE_NAME}"
CHECKSUM_URL="${DOWNLOAD_BASE_URL}/${ARCHIVE_NAME}.sha256"

# Create a temporary working directory
TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'diffrex-install')"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# Download tool selection
download_file() {
  url="$1"
  dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$url"
  else
    echo "❌ Error: Neither curl nor wget found in PATH." >&2
    exit 1
  fi
}

echo "⬇️  Downloading ${ARCHIVE_NAME}..."
if ! download_file "$DOWNLOAD_URL" "$TMP_DIR/$ARCHIVE_NAME"; then
  echo "❌ Error: Failed to download ${DOWNLOAD_URL}" >&2
  exit 1
fi

# Optional checksum verification
if download_file "$CHECKSUM_URL" "$TMP_DIR/${ARCHIVE_NAME}.sha256" 2>/dev/null; then
  echo "🔍 Verifying SHA-256 checksum..."
  EXPECTED_HASH="$(awk '{print $1}' "$TMP_DIR/${ARCHIVE_NAME}.sha256")"
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_HASH="$(sha256sum "$TMP_DIR/$ARCHIVE_NAME" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_HASH="$(shasum -a 256 "$TMP_DIR/$ARCHIVE_NAME" | awk '{print $1}')"
  else
    ACTUAL_HASH=""
  fi

  if [ -n "$ACTUAL_HASH" ]; then
    if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
      echo "❌ Error: Checksum verification failed!" >&2
      echo "  Expected: $EXPECTED_HASH" >&2
      echo "  Actual:   $ACTUAL_HASH" >&2
      exit 1
    fi
    echo "✅ Checksum verified."
  fi
fi

echo "📦 Extracting package..."
tar -xzf "$TMP_DIR/$ARCHIVE_NAME" -C "$TMP_DIR"

# Locate the extracted directory or executable
EXTRACTED_DIR="$TMP_DIR/$ARTIFACT_NAME"
if [ ! -d "$EXTRACTED_DIR" ]; then
  # Fallback if tar extracted directly into root
  EXTRACTED_DIR="$TMP_DIR"
fi

# Ensure destination directories exist
mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"

# Clean up previous installation
rm -rf "${INSTALL_DIR:?}"/*

# Copy new installation files
cp -R "$EXTRACTED_DIR"/* "$INSTALL_DIR/"

# Ensure the executable exists and has execute permissions
MAIN_BIN="$INSTALL_DIR/diffrex"
if [ ! -f "$MAIN_BIN" ]; then
  echo "❌ Error: Binary 'diffrex' not found in package." >&2
  exit 1
fi
chmod +x "$MAIN_BIN"

# Create symlink in BIN_DIR
ln -sf "$MAIN_BIN" "$BIN_DIR/diffrex"

echo "🎉 Diffrex successfully installed to $INSTALL_DIR"
echo "🔗 Symlink created at $BIN_DIR/diffrex"

# Check if BIN_DIR is in PATH
case ":$PATH:" in
  *":$BIN_DIR:"*)
    echo ""
    echo "Ready to use! Run:"
    echo "  diffrex --version"
    ;;
  *)
    echo ""
    echo "⚠️  Note: '$BIN_DIR' is not in your PATH environment variable."
    echo "To run diffrex from anywhere, add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo ""
    echo "  export PATH=\"\$PATH:$BIN_DIR\""
    echo ""
    ;;
esac
