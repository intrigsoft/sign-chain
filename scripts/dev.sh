#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# ── Colors ──────────────────────────────────────────────
red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
cyan()  { printf '\033[0;36m%s\033[0m\n' "$*"; }

# ── Cleanup on exit ────────────────────────────────────
cleanup() {
  cyan "Stopping Docker services..."
  docker compose down
}
trap cleanup EXIT

# ── 1. Start infrastructure ────────────────────────────
cyan "Starting postgres & hardhat..."
docker compose up -d postgres hardhat

# ── 2. Wait for postgres ───────────────────────────────
cyan "Waiting for postgres..."
RETRIES=30
until docker compose exec -T postgres pg_isready -U signchain > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    red "Postgres failed to start"
    exit 1
  fi
  sleep 1
done
green "Postgres is ready"

# ── 3. Wait for hardhat ───────────────────────────────
cyan "Waiting for hardhat node (this may take a while on first run)..."
RETRIES=60
until curl -sf http://127.0.0.1:8545 -X POST \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    red "Hardhat node failed to start"
    docker compose logs hardhat
    exit 1
  fi
  sleep 2
done
green "Hardhat node is ready"

# ── 4. Install contracts deps on host (needed for deploy) ─
if [ ! -d contracts/node_modules ]; then
  cyan "Installing contracts dependencies..."
  (cd contracts && npm install)
fi

# ── 5. Deploy contracts ───────────────────────────────
cyan "Deploying contracts to local hardhat node..."
(cd contracts && npx hardhat run scripts/deploy.ts --network localhost)

# ── 6. Patch API .env with contract addresses ─────────
if [ ! -f contracts/.env.local ]; then
  red "contracts/.env.local not found — deploy may have failed"
  exit 1
fi

# Source the deployed addresses
SIGNCHAIN_CONTRACT_ADDRESS=$(grep '^SIGNCHAIN_CONTRACT_ADDRESS=' contracts/.env.local | cut -d= -f2)
FORWARDER_CONTRACT_ADDRESS=$(grep '^FORWARDER_CONTRACT_ADDRESS=' contracts/.env.local | cut -d= -f2)

# Hardhat account #0 private key (well-known, used for local dev only)
RELAYER_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

API_ENV="apps/api/.env"
cp apps/api/.env.example "$API_ENV"
sed -i "s|^SIGNCHAIN_CONTRACT_ADDRESS=.*|SIGNCHAIN_CONTRACT_ADDRESS=${SIGNCHAIN_CONTRACT_ADDRESS}|" "$API_ENV"
sed -i "s|^FORWARDER_CONTRACT_ADDRESS=.*|FORWARDER_CONTRACT_ADDRESS=${FORWARDER_CONTRACT_ADDRESS}|" "$API_ENV"
sed -i "s|^RELAYER_PRIVATE_KEY=.*|RELAYER_PRIVATE_KEY=${RELAYER_PRIVATE_KEY}|" "$API_ENV"
green "Wrote contract addresses to $API_ENV"

# ── 7. Prisma generate + migrate + seed ───────────────
cyan "Running Prisma migrations..."
(cd apps/api && npx prisma generate && npx prisma migrate dev && npx prisma db seed)
green "Database is ready"

# ── 8. Start API (replaces this process) ──────────────
cyan "Starting API server..."
exec npx nx serve api
