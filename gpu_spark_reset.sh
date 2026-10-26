#!/bin/bash
# Redirect to categorized launcher in deploy/linux_mac/
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/deploy/linux_mac/gpu_reset.sh" "$@"
