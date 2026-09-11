#!/usr/bin/env bash
set -euo pipefail

# Segunda opinión de un modelo externo (OpenRouter) para los subagentes guardianes.
# Uso: scripts/consult-openrouter.sh "<prompt>" [modelo]
# Modelo por defecto: nvidia/nemotron-3-ultra-550b-a55b:free (gratis, 550B params/55B activos, 1M contexto)
# Alternativas gratis: nex-agi/nex-n2.5-pro:free (agentic coding), thinkingmachines/inkling:free
# Alternativa paga casi gratis si se agotan los límites del free: qwen/qwen3-coder-30b-a3b-instruct

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "Error: OPENROUTER_API_KEY no está definida en .env.local" >&2
  exit 1
fi

PROMPT="${1:?Uso: consult-openrouter.sh \"<prompt>\" [modelo]}"
MODEL="${2:-nvidia/nemotron-3-ultra-550b-a55b:free}"

# Si la variable SYSTEM_PROMPT viene seteada, se manda como mensaje "system".
BODY=$(jq -n --arg model "$MODEL" --arg prompt "$PROMPT" --arg sys "${SYSTEM_PROMPT:-}" '
  if $sys != "" then
    {model: $model, messages: [{role: "system", content: $sys}, {role: "user", content: $prompt}]}
  else
    {model: $model, messages: [{role: "user", content: $prompt}]}
  end
')

RESPONSE=$(curl -sS https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$BODY")

echo "$RESPONSE" | jq -r '.choices[0].message.content // (.error.message // "Sin respuesta de OpenRouter")'
