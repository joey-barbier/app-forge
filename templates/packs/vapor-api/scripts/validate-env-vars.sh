#!/bin/bash
# Cross-checks the typed config (AppConfig.Key) against env_dist and every deploy
# manifest that exists. A variable that exists in code but not in a manifest is a
# production crash waiting for the next deploy — fail loudly here instead.
#
# Usage: ./scripts/validate-env-vars.sh   (from anywhere; exits 1 on any mismatch)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_CONFIG="$PROJECT_ROOT/Sources/App/Configure/AppConfig.swift"
ENV_DIST="$PROJECT_ROOT/env_dist"

# Manifests are optional — checked only if present. Add yours here as the project grows.
MANIFESTS=(
    "$PROJECT_ROOT/docker-compose.yml"
    "$PROJECT_ROOT/deploy/docker-compose.yml"
    "$PROJECT_ROOT/.github/workflows/deploy.yml"
    "$PROJECT_ROOT/.github/workflows/test.yml"
)

echo "Validating environment variables against AppConfig.Key..."
echo ""

# Extract case names from the AppConfig.Key enum ("case VARIABLE_NAME").
ENV_VARS=$(grep -E '^\s*case [A-Z_]+' "$APP_CONFIG" | sed 's/.*case //' | sed 's/[^A-Z_].*//' | sort -u)

if [ -z "$ENV_VARS" ]; then
    echo -e "${RED}No Key cases found in $APP_CONFIG — wrong path?${NC}"
    exit 1
fi

ALL_VALID=true

for var in $ENV_VARS; do
    if ! grep -q "^${var}=" "$ENV_DIST" 2>/dev/null; then
        echo -e "${RED}MISSING in env_dist: ${var}${NC}"
        ALL_VALID=false
    fi
    for manifest in "${MANIFESTS[@]}"; do
        if [ -f "$manifest" ]; then
            if ! grep -Eq "${var}[:=]" "$manifest" 2>/dev/null; then
                echo -e "${RED}MISSING in ${manifest#"$PROJECT_ROOT"/}: ${var}${NC}"
                ALL_VALID=false
            fi
        fi
    done
done

# Reverse check: env_dist entries that no longer exist in code (drift the other way).
# LOG_LEVEL is exempt — read in entrypoint.swift before AppConfig exists.
for var in $(grep -E '^[A-Z_]+=' "$ENV_DIST" | cut -d= -f1 | sort -u); do
    [ "$var" = "LOG_LEVEL" ] && continue
    if ! echo "$ENV_VARS" | grep -q "^${var}$"; then
        echo -e "${YELLOW}STALE in env_dist (no AppConfig.Key case): ${var}${NC}"
    fi
done

echo ""
if [ "$ALL_VALID" = true ]; then
    echo -e "${GREEN}All environment variables are consistent.${NC}"
else
    echo -e "${RED}Fix the mismatches above before committing.${NC}"
    exit 1
fi
