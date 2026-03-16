#!/bin/bash
# Ghostty Performance Benchmark Script

echo "=== Ghostty Performance Benchmark ==="
echo "Date: $(date)"
echo ""

# Test Ghostty startup time
echo "Testing Ghostty..."
hyperfine --warmup 3 --runs 10 \
  --export-markdown ghostty-results.md \
  'ghostty -e exit'

echo ""
echo "Results saved to ghostty-results.md"
