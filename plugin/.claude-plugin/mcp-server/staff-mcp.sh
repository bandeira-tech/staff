#!/usr/bin/env bash
# staff-mcp.sh — launch `bnd node` as an MCP stdio server for staff.
#
# The rig (./staff.rig.ts, sibling of this script) ships with the plugin.
# Override with $STAFF_RIG if you want a different rig.
#
# Prerequisites:
#   deno install --global -A -n bnd jsr:@bandeira-tech/b3nd-cli@^0.5.0
#
# Data dir (resolved inside staff.rig.ts):
#   $STAFF_DATA_DIR, or ~/.staff/fs by default.

set -u
log() { printf '[staff-mcp] %s\n' "$*" >&2; }

if ! command -v bnd >/dev/null 2>&1; then
  log "ERROR: \`bnd\` not on PATH. Install:"
  log "  deno install --global -A -n bnd jsr:@bandeira-tech/b3nd-cli@^0.5.0"
  exit 127
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RIG="${STAFF_RIG:-$SCRIPT_DIR/../staff.rig.ts}"

if [ ! -f "$RIG" ]; then
  log "ERROR: rig not found at $RIG"
  log "Set STAFF_RIG to override."
  exit 1
fi

log "rig: $RIG"
log "data: ${STAFF_DATA_DIR:-$HOME/.staff/fs}"
exec bnd node --mcp "$RIG"
