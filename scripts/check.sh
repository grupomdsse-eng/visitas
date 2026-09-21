#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/preflight.py
node --check app/src/main/assets/site/app.js
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
javac -encoding UTF-8 -d "$TMP" app/src/main/java/com/grupomds/visitas/SecurityPolicy.java tests/SecurityPolicyTest.java
java -cp "$TMP" SecurityPolicyTest
