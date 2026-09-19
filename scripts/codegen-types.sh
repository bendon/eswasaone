#!/usr/bin/env bash
# Generate contracts/types.ts from openapi.yaml
# Requires: npx openapi-typescript (no global install needed)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npx --yes openapi-typescript contracts/openapi.yaml -o contracts/types.ts
echo "Wrote contracts/types.ts"
