#!/bin/bash
# Test runner dengan progress indicator yang lebih jelas

set -eo pipefail

echo "🧪 Starting tests with progress indicator..."
echo ""

# Check if specific test file is provided
if [ -n "$1" ]; then
  echo "Running specific test: $1"
  pnpm vitest run "$1" --reporter=verbose
  exit $?
fi

# Run tests with progress
echo "Running unit tests..."
pnpm vitest run --config vitest.unit.config.ts --reporter=verbose --maxWorkers=4 2>&1 | tee /tmp/test-output.log

echo ""
echo "✅ Tests completed. Check /tmp/test-output.log for full output."
