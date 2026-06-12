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
#   LICENSE                          — copyright holder
#   package.json "url"/"author" line — repository URL + author
#   this script                      — see "deliberate self-reference" below
#
# Deliberate self-reference: the patterns below necessarily spell out the
# forbidden names (that is the whole point of a checker). The names are
# assembled from fragments so the script never literally contains a banned
# string AND the scan explicitly excludes this file from its own grep — so the
# checker can name the forbidden strings without flagging itself. This is the
# one intentional exception; do not copy the pattern into template files.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Forbidden strings, assembled from fragments: two app names, a tracker product,
# the company (two spellings), a third internal codename, the author email
# prefix, an Apple team ID, and the company bundle-id prefix.
A='ken' B='bang' C='lib' D='o' E='ho' F='joey' G='6M37' H='Te' I='mb' J='com\.o' K='TE'

# Names that are NEVER benign English: matched case-insensitively but anchored on
# word boundaries so substrings inside common words don't trip (e.g. "orka" inside
# "workaround", "tenor" the singing voice). '.', '@' and '/' count as boundaries,
# so real bundle ids and emails (com.orka, joey@orka.pw) still match.
NAMES_CI="${A}map|${B}map|${C}tracker|${D}rka|${E}rka|${I}app"

# Dictionary-word codename ("tenor" = a voice type): matched case-SENSITIVELY in
# its identifier forms only (leading boundary + a capital). Catches Tenor,
# TENOR, TenorService, TENOR_API… but ignores lowercase prose "tenor".
NAME_CS="${H}nor|${K}NOR"

# Exact-form secrets — specific enough to match raw: an email prefix, an Apple
# team id, and the company reverse-DNS prefix.
LITERAL="${F}@|${G}52W435|${J}rka"

PATTERN_CI="\\b(${NAMES_CI})\\b|${LITERAL}"   # case-insensitive
PATTERN_CS="\\b(${NAME_CS})"                  # case-sensitive

# Scan TRACKED files, minus the allowlist and this checker itself. We feed the
# list to the system `grep` (not `git grep`): git's regex engine does not honor
# the `\b` word boundary, whereas BSD/GNU grep do — and those boundaries are what
# keep "orka" out of "workaround" and the voice "tenor" out of the results.
# `git ls-files -z` is NUL-delimited and `xargs -0 … grep -I` skips binaries, so
# odd paths are safe and bash 3.2 (default macOS) works — no arrays needed.
# The published npm package is scoped to the author's PUBLIC npm scope, which
# legitimately puts "horka" in the repo-meta files (package.json name, README and
# CLI usage strings). That scope is intentional public branding, not a leak — so
# the meta files below are scanned with the scope literal stripped first, while
# TEMPLATES stay 100% strict (no exception ever ships into a generated project).
SCOPE='@horka/app-forge'
META='README.md bin/cli.js CONTRIBUTING.md'
list_files() {
  git ls-files -z -- \
    ':(exclude)LICENSE' \
    ':(exclude)package.json' \
    ':(exclude)README.md' \
    ':(exclude)bin/cli.js' \
    ':(exclude)CONTRIBUTING.md' \
    ':(exclude).github/scripts/leakage-check.sh'
}

fail=0

# grep exits 1 on "no match" (our success case). The printed line is
# file:line:matched-text, so a reviewer sees which fragment hit where.

# 1) Case-insensitive names + literal secrets (everything except meta + allowlist).
if list_files | xargs -0 grep -nIiE "$PATTERN_CI"; then
  echo "::error::Forbidden project-specific strings in tracked files (file:line:match above)."
  fail=1
fi

# 2) Case-sensitive dictionary-word codename, same scope.
if list_files | xargs -0 grep -nIE "$PATTERN_CS"; then
  echo "::error::Forbidden internal codename (identifier form) in tracked files (above)."
  fail=1
fi

# 3) Repo-meta files (package.json + README + CLI + CONTRIBUTING): scan with the
#    public scope literal removed, so only a REAL leak (not the @scope) trips it.
for f in package.json $META; do
  [ -f "$f" ] || continue
  if sed "s#${SCOPE}##g" "$f" | grep -nIiE "$PATTERN_CI" | grep -vE '"url"|"author"'; then
    echo "::error::Forbidden strings in $f (outside the public npm scope / repo URL / author)."
    fail=1
  fi
  if sed "s#${SCOPE}##g" "$f" | grep -nIE "$PATTERN_CS"; then
    echo "::error::Forbidden internal codename in $f."
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "Leakage check passed: no forbidden strings in tracked files."
fi
exit "$fail"
