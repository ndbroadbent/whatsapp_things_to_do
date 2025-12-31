#!/bin/bash
# Check file length limits
# - Code files: 500 lines max
# - Test files: 1000 lines max

set -e

MAX_CODE_LINES=500
MAX_TEST_LINES=1000
EXIT_CODE=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

check_file() {
  local file="$1"
  local line_count

  # Skip if file doesn't exist
  [[ ! -f "$file" ]] && return 0

  # Skip excluded patterns
  case "$file" in
    *.md|*.json|*.json.gz|*.yml|*.yaml|*.sql|*.txt|*.lock|*.css|*.html|*.gz|*.snap|LICENSE)
      return 0
      ;;
    *node_modules*|*dist/*|*fixtures/*|*queries/*|*__snapshots__/*)
      return 0
      ;;
  esac

  line_count=$(wc -l < "$file" | tr -d ' ')

  # Determine max lines based on file type
  local max_lines=$MAX_CODE_LINES
  if [[ "$file" == *.test.ts ]] || [[ "$file" == *.spec.ts ]]; then
    max_lines=$MAX_TEST_LINES
  fi

  if [[ $line_count -gt $max_lines ]]; then
    echo -e "${RED}❌ $file: $line_count lines (max: $max_lines)${NC}"
    EXIT_CODE=1
  fi
}

# If specific files are passed, check only those
if [[ $# -gt 0 ]]; then
  for file in "$@"; do
    check_file "$file"
  done
else
  # Check all TypeScript files in src/
  while IFS= read -r -d '' file; do
    check_file "$file"
  done < <(find src -type f -name "*.ts" -print0 2>/dev/null || true)
fi

if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}✅ All files within length limits${NC}"
fi

exit $EXIT_CODE
