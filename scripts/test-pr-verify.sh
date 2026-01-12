#!/bin/bash
# Test script to simulate GitHub Actions PR context locally

echo "🧪 Testing verification script in PR context..."
echo ""

GITHUB_EVENT_NAME=pull_request GITHUB_ACTIONS=true yarn verify

exit_code=$?

if [ $exit_code -eq 0 ]; then
  echo ""
  echo "✅ Test passed: Script would succeed in PR context"
else
  echo ""
  echo "❌ Test failed: Script would fail in PR context (as expected if no new tokens)"
fi

exit $exit_code
