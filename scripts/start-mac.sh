#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Dieses Startskript ist für macOS. Siehe README für Docker/CPU.' >&2
  exit 1
fi
docker info >/dev/null
mkdir -p .runtime/ollama .runtime/models work
if [[ ! -x .runtime/ollama/ollama ]]; then
  curl -fL --retry 2 https://github.com/ollama/ollama/releases/download/v0.40.13/ollama-darwin.tgz -o work/ollama-darwin.tgz
  tar -xzf work/ollama-darwin.tgz -C .runtime/ollama
fi
export OLLAMA_HOST=127.0.0.1:11435
export OLLAMA_MODELS="$PWD/.runtime/models"
# Enough room on this 32-GB Mac to retain embedding + chat model together.
export OLLAMA_MAX_LOADED_MODELS=2
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_KEEP_ALIVE=30m
if ! curl -fsS --max-time 2 http://127.0.0.1:11435/api/version >/dev/null 2>&1; then
  python3 - <<'PY'
import os, subprocess
from pathlib import Path
root = Path.cwd()
with open(root / '.runtime/ollama.log', 'ab') as log:
    process = subprocess.Popen([str(root / '.runtime/ollama/ollama'), 'serve'],
        env=os.environ.copy(), stdin=subprocess.DEVNULL, stdout=log,
        stderr=subprocess.STDOUT, start_new_session=True)
(root / '.runtime/ollama.pid').write_text(str(process.pid))
PY
fi
for attempt in {1..30}; do
  if curl -fsS --max-time 2 http://127.0.0.1:11435/api/version >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --max-time 2 http://127.0.0.1:11435/api/version >/dev/null
# Download only missing models; ordinary starts also work offline.
for model in qwen3-embedding:0.6b qwen3:4b-instruct; do
  if ! .runtime/ollama/ollama show "$model" >/dev/null 2>&1; then
    .runtime/ollama/ollama pull "$model"
  fi
done
export OLLAMA_URL=http://host.docker.internal:11435
docker compose up -d --build api qdrant
docker compose --profile cpu stop ollama
printf '\nBibelraum: http://localhost:8000\nOllama-Log: .runtime/ollama.log\n'
