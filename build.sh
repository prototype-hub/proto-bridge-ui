#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

FRONTEND_IMAGE="${FRONTEND_IMAGE:-proto-bridge-ui:local}"
pnpm run build
docker build -t "$FRONTEND_IMAGE" .
