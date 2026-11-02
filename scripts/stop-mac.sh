#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose stop api qdrant
if [[ -f .runtime/ollama.pid ]]; then
  native_pid=$(cat .runtime/ollama.pid)
  native_command=$(ps -p "$native_pid" -o command= 2>/dev/null || true)
  if [[ "$native_command" == "$PWD/.runtime/ollama/ollama serve" ]]; then
    kill "$native_pid"
  fi
fi
printf 'Bibelraum gestoppt. Modelle und Bibelbestand bleiben erhalten.\n'
