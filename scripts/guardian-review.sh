#!/usr/bin/env bash
set -euo pipefail

# Corre el análisis pesado de un guardián en un modelo barato (OpenRouter),
# en vez de gastar tokens de Claude en leer/analizar el código.
#
# Uso: scripts/guardian-review.sh <nombre-guardian> [archivo1 archivo2 ...]
# Sin archivos: usa el diff actual de git (staged + unstaged).
# Modelo: variable de entorno GUARDIAN_MODEL (default nvidia/nemotron-3-ultra-550b-a55b:free).

cd "$(dirname "$0")/.."

NOMBRE="${1:?Uso: guardian-review.sh <nombre-guardian> [archivos...]}"
shift || true

REGLAS_FILE=".claude/guardian-rules/${NOMBRE}.md"
if [ ! -f "$REGLAS_FILE" ]; then
  echo "Error: no existen reglas en $REGLAS_FILE" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  CONTENIDO=$(cat "$@")
else
  CONTENIDO="$(git diff HEAD)"$'\n'"$(git diff --cached)"
fi

if [ -z "${CONTENIDO// /}" ]; then
  echo "No hay cambios ni archivos para revisar." >&2
  exit 1
fi

export SYSTEM_PROMPT
SYSTEM_PROMPT=$(cat "$REGLAS_FILE")

"$(dirname "$0")/consult-openrouter.sh" \
  "Revisa el siguiente diff/código siguiendo al pie de la letra las reglas del sistema. Da un veredicto claro (aprobado / bloqueado / requiere ajustes) y señala explícitamente cualquier regla que se rompa:

$CONTENIDO" \
  "${GUARDIAN_MODEL:-nvidia/nemotron-3-ultra-550b-a55b:free}"
