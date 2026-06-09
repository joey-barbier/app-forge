#!/usr/bin/env bash
# Leakage gate — "proof over claims" applies to the boilerplate itself.
#
# AppForge templates are extracted from private production apps. Nothing
# project-specific may ship in this repo: no app or company names, no emails,
# no Apple team IDs, no real bundle-id prefixes.
#
# Local self-check (scans TRACKED files — `git add` new files first):
#   bash .github/scripts/leakage-check.sh
#
# Allowlist (and nothing else):
#   LICENSE                  — copyright holder
#   package.json "url" line  — repository URL
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Forbidden strings, assembled from fragments so this script never matches
# itself: two app names, a tracker product, the company (two spellings), the
# author email prefix, an Apple team ID, two internal codenames, and the
# company bundle-id prefix. Matching is case-insensitive and substring-based.
A='ken' B='bang' C='lib' D='o' E='ho' F='joey' G='6M37' H='te' I='mb' J='com\.o'
PATTERN="${A}map|${B}map|${C}tracker|${D}rka|${E}rka|${F}@|${G}52W435|${H}nor|${I}app|${J}rka"

fail=0

# 1) Every tracked file except the two allowlisted ones.
if git grep -nIiE "$PATTERN" -- ':(exclude)LICENSE' ':(exclude)package.json'; then
  echo "::error::Forbidden project-specific strings in tracked files (matches above)."
  fail=1
fi

# 2) package.json — matches allowed ONLY on the repository "url" line.
if grep -niE "$PATTERN" package.json | grep -v '"url"'; then
  echo "::error::Forbidden strings in package.json outside the repository URL."
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "Leakage check passed: no forbidden strings in tracked files."
fi
exit "$fail"
