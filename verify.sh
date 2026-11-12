#!/usr/bin/env bash
# Checks that dist/ooz.wasm matches SHA256SUMS (build it first with ./build.sh to prove the build is reproducible).
set -euo pipefail
cd "$(dirname "$0")"
sha256sum -c SHA256SUMS
