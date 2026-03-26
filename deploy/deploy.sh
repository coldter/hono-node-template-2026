#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$REPO_ROOT"

# Check .env.production exists
if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found."
  echo "Copy .env.production.example to .env.production and fill in values."
  exit 1
fi

# Load env for compose interpolation
set -a
source .env.production
set +a

COMPOSE_CMD=(docker compose -f compose.prod.yaml)

BUILD_ARGS=(--build --remove-orphans)
if [[ "${1:-}" == "--no-cache" ]] || [[ "${2:-}" == "--no-cache" ]]; then
  BUILD_ARGS=(--build --no-cache --remove-orphans)
fi

if [[ "${1:-}" == "--seed" ]]; then
  echo "Building and starting services (with seed)..."
  "${COMPOSE_CMD[@]}" --profile seed up -d "${BUILD_ARGS[@]}"
else
  echo "Building and starting services..."
  "${COMPOSE_CMD[@]}" up -d "${BUILD_ARGS[@]}"
fi

echo ""
echo "Services starting. Check logs with:"
echo "  docker compose -f compose.prod.yaml logs -f"
echo ""
echo "Endpoints (configure in .env.production):"
echo "  API:       https://${API_DOMAIN:-your-api.example.com}"
echo "  App:       https://${APP_DOMAIN:-your-app.example.com}"
echo "  Mail:      https://${MAIL_DOMAIN:-your-mail.example.com}"
echo "  Hatchet:   https://${HATCHET_DASHBOARD_DOMAIN:-your-hatchet.example.com}"
