#!/bin/bash
# Generates docs/ERROR_CODES.md from the typed error enums in Sources/App/Error/Failed.swift.
# THE DOC IS GENERATED — never edit it by hand; edit the enum and re-run this script.
#
# Depends on two CONVENTIONS.md rules:
#   - one enum per HTTP status, conforming to CustomError
#   - convert() stays on ONE line: `func convert() -> HTTPStatus { .badRequest }`

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

FAILED_SWIFT="$PROJECT_ROOT/Sources/App/Error/Failed.swift"
OUTPUT="$PROJECT_ROOT/docs/ERROR_CODES.md"

mkdir -p "$PROJECT_ROOT/docs"

status_code() {
    case "$1" in
        badRequest) echo 400 ;;
        unauthorized) echo 401 ;;
        paymentRequired) echo 402 ;;
        forbidden) echo 403 ;;
        notFound) echo 404 ;;
        conflict) echo 409 ;;
        gone) echo 410 ;;
        unprocessableEntity) echo 422 ;;
        tooManyRequests) echo 429 ;;
        internalServerError) echo 500 ;;
        notImplemented) echo 501 ;;
        serviceUnavailable) echo 503 ;;
        *) echo "?" ;;
    esac
}

{
    echo "# Error Codes — GENERATED FILE, DO NOT EDIT"
    echo ""
    echo "> Source of truth: \`Sources/App/Error/Failed.swift\`."
    echo "> Regenerate with \`./scripts/generate-error-codes.sh\`."
    echo ""
    echo "Response body shape: \`{\"code\": <http status>, \"name\": \"<case>\", \"description\": \"<reason>\"}\`"
    echo ""
    echo "| name | HTTP | category |"
    echo "|---|---|---|"
} > "$OUTPUT"

current_enum=""
cases=""

flush() {
    [ -z "$current_enum" ] && return
    code=$(status_code "$1")
    for c in $cases; do
        echo "| \`$c\` | $code | $current_enum |" >> "$OUTPUT"
    done
    cases=""
}

while IFS= read -r line; do
    if [[ "$line" =~ enum[[:space:]]+([A-Za-z]+):[[:space:]]*CustomError ]]; then
        current_enum="${BASH_REMATCH[1]}"
        cases=""
    elif [[ "$line" =~ ^[[:space:]]+case[[:space:]]+([a-zA-Z]+) ]]; then
        cases="$cases ${BASH_REMATCH[1]}"
    elif [[ "$line" =~ convert\(\)[[:space:]]*-\>[[:space:]]*HTTPStatus[[:space:]]*\{[[:space:]]*\.([a-zA-Z]+) ]]; then
        flush "${BASH_REMATCH[1]}"
        current_enum=""
    fi
done < "$FAILED_SWIFT"

echo "Generated $OUTPUT"
