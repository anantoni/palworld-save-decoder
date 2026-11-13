#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Checks that dist/ooz.wasm matches SHA256SUMS (build it first with ./build.sh to prove the build is reproducible).
set -euo pipefail
cd "$(dirname "$0")"
sha256sum -c SHA256SUMS
