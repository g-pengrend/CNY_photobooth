#!/bin/bash
# Redirect to categorized launcher in deploy/linux_mac/
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$DIR/deploy/linux_mac/"*.sh 2>/dev/null
exec bash "$DIR/deploy/linux_mac/1_standalone_full_system.sh" "$@"
