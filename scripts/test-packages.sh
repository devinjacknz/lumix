#!/bin/bash

# Array of package directories
PACKAGES=(
  "core"
  "adapter-sqlite" #100% coverage
  "types"
  "agent" #100% coverage
  "cli"
  "helius"
  "models"
  "plugin-chain-core"
  "plugin-dashboard"
  "plugin-data-collector"
  "plugin-defi-crawler"
  "plugin-edwin"
  "plugin-evm-sandbox"
  "plugin-multisig"
  "plugin-nebula"
  "plugin-news"
  "plugin-price-oracle"
  "plugin-token-analyzer"
  "tools"
  "plugin-alert"
  "plugin-loader"
  "plugin-oracle-validator"
  "plugin-protocol-graph"
  "plugin-token-analysis"
)

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Run tests for each package
for package in "${PACKAGES[@]}"; do
  echo -e "\n${GREEN}Testing package: ${package}${NC}"
  pnpm test:coverage --testPathPattern="packages/${package}"
  
  # Check if tests passed
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Tests passed for ${package}${NC}"
  else
    echo -e "${RED}✗ Tests failed for ${package}${NC}"
  fi
done 