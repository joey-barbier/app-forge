#!/usr/bin/env bash
# Templates sanity gate.
#
# 1) Placeholders — bin/cli.js substitutes EXACTLY three tokens:
#      {{PROJECT_NAME}}  {{BUNDLE_ID}}  {{PACK_LABEL}}
#    in file contents AND in file/directory names. Any other {{UPPER_SNAKE}}
#    token found in templates/ is a typo that would ship verbatim into every
#    scaffolded project. Lowercase or spaced mustaches (e.g. Vue's
#    "{{ count }}") are legitimate template-language syntax and are ignored.
# 2) Pack manifests — every templates/packs/*/pack.json must parse as JSON,
#    declare id / label / languages, and id must equal its directory name
#    (it is what `--platform <id>` selects).
#
# Local self-check:
#   bash .github/scripts/templates-sanity.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail=0

# ---- 1) Placeholder audit (file contents + paths) ---------------------------
allowed='PROJECT_NAME|BUNDLE_ID|PACK_LABEL'
tokens="$(
  {
    grep -rIhoE '\{\{[A-Z][A-Z0-9_]*\}\}' templates/ || true
    find templates -print | grep -oE '\{\{[A-Z][A-Z0-9_]*\}\}' || true
  } | sort -u
)"
unknown="$(printf '%s\n' "$tokens" | grep -vE "^\{\{(${allowed})\}\}$" | grep -v '^$' || true)"
if [ -n "$unknown" ]; then
  echo "::error::Unknown placeholder(s) in templates/ — the scaffolder only substitutes {{PROJECT_NAME}}, {{BUNDLE_ID}}, {{PACK_LABEL}}:"
  echo "$unknown"
  echo "Locations:"
  while IFS= read -r token; do
    if [ -n "$token" ]; then
      grep -rnF "$token" templates/ || true
    fi
  done <<< "$unknown"
  fail=1
else
  echo "Placeholder audit OK — only supported tokens found:"
  printf '%s\n' "$tokens"
fi

# ---- 2) Pack manifests -------------------------------------------------------
node -e '
const fs = require("fs");
const path = require("path");
const packsDir = "templates/packs";
let fail = false;
for (const entry of fs.readdirSync(packsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(packsDir, entry.name, "pack.json");
  if (!fs.existsSync(file)) {
    console.error(`::error::${file} is missing - every pack needs a manifest`);
    fail = true;
    continue;
  }
  let pack;
  try {
    pack = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`::error::${file} is not valid JSON: ${e.message}`);
    fail = true;
    continue;
  }
  let ok = true;
  for (const key of ["id", "label", "languages"]) {
    if (!pack[key] || (Array.isArray(pack[key]) && pack[key].length === 0)) {
      console.error(`::error::${file}: missing required key "${key}"`);
      ok = false;
    }
  }
  if (pack.id && pack.id !== entry.name) {
    console.error(`::error::${file}: id "${pack.id}" must equal the directory name "${entry.name}"`);
    ok = false;
  }
  if (ok) console.log(`pack.json OK: ${pack.id} - ${pack.label}`);
  else fail = true;
}
process.exit(fail ? 1 : 0);
' || fail=1

if [ "$fail" -eq 0 ]; then
  echo "Templates sanity passed."
fi
exit "$fail"
