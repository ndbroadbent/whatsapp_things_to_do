#!/bin/bash
# Check for forbidden personal names in source code
# These should not appear in production code (use generic names in tests)

set -e

EXIT_CODE=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Forbidden patterns (case-insensitive grep patterns)
FORBIDDEN_PATTERNS=(
  "Nathan Broadbent"
  "Masha Broadbent"
)

# Allowlisted files (relative to repo root)
ALLOWLIST=(
  "scripts/check_forbidden_names.sh"  # This script itself
)

is_allowlisted() {
  local file="$1"
  for allowed in "${ALLOWLIST[@]}"; do
    if [[ "$file" == *"$allowed" ]]; then
      return 0
    fi
  done
  return 1
}

check_file() {
  local file="$1"

  # Skip if file doesn't exist
  [[ ! -f "$file" ]] && return 0

  # Skip binary and non-source files
  case "$file" in
    *.gz|*.zip|*.png|*.jpg|*.jpeg|*.gif|*.ico|*.woff|*.woff2|*.ttf|*.eot|*.pdf)
      return 0
      ;;
    *node_modules*|*dist/*|*.lock)
      return 0
      ;;
  esac

  # Skip allowlisted files
  if is_allowlisted "$file"; then
    return 0
  fi

  for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    if grep -q "$pattern" "$file" 2>/dev/null; then
      echo -e "${RED}❌ $file: contains forbidden name '$pattern'${NC}"
      echo "   Use generic names like 'Alice Smith', 'Bob Jones' instead (first + last required)"
      echo "   Also review the surrounding content - anonymize any sensitive or personal chat data"
      EXIT_CODE=1
    fi
  done
}

# If specific files are passed, check only those
if [[ $# -gt 0 ]]; then
  for file in "$@"; do
    check_file "$file"
  done
else
  # Check all source files
  while IFS= read -r -d '' file; do
    check_file "$file"
  done < <(find src -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.md" \) -print0 2>/dev/null || true)
fi

if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}✅ No forbidden names found${NC}"
fi

exit $EXIT_CODE
