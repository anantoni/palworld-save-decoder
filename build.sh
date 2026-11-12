#!/usr/bin/env bash
# Build dist/ooz.wasm with wasi-sdk (https://github.com/WebAssembly/wasi-sdk), e.g. WASI_SDK=/opt/wasi-sdk-34.0-x86_64-linux ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
W="${WASI_SDK:?set WASI_SDK to the wasi-sdk directory}"
mkdir -p dist
"$W/bin/clang++" --target=wasm32-wasip1 --sysroot="$W/share/wasi-sysroot" -O3 -msimd128 -fno-exceptions -fno-rtti -w -fpermissive \
  -mexec-model=reactor -Wl,--no-entry -Wl,--strip-all -o dist/ooz.wasm src/api.cpp src/kraken.cpp src/bitknit.cpp src/lzna.cpp
ls -l dist/ooz.wasm
