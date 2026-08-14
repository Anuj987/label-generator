#!/usr/bin/env bash
set -euo pipefail

# Static HTML app — no package dependencies. Verify required files exist.
test -f index.html.html
echo "Label generator files verified."
