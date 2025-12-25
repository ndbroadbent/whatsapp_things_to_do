#!/usr/bin/env bash
# Check for forbidden biome-ignore comments in source code

if grep -r "biome-ignore" --include="*.ts" src/ 2>/dev/null; then
  echo "❌ Found biome-ignore comments - these are forbidden!"
  exit 1
fi
echo "✅ No biome-ignore comments found"
