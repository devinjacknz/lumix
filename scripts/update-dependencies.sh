#!/bin/bash

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查 pnpm 是否安装
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}Error: pnpm is not installed${NC}"
    echo "Installing pnpm..."
    npm install -g pnpm
fi

# 更新 LangChain 相关依赖
echo -e "${YELLOW}Updating LangChain dependencies...${NC}"

# 主要依赖
DEPS=(
    "langchain"
    "@langchain/core"
    "@langchain/openai"
    "@langchain/anthropic"
    "@langchain/community"
)

# 开发依赖
DEV_DEPS=(
    "@types/langchain"
)

# 更新主要依赖
for dep in "${DEPS[@]}"; do
    echo -e "${YELLOW}Updating ${dep}...${NC}"
    pnpm add "$dep@latest"
done

# 更新开发依赖
for dep in "${DEV_DEPS[@]}"; do
    echo -e "${YELLOW}Updating ${dep}...${NC}"
    pnpm add -D "$dep@latest"
done

# 清理缓存
echo -e "${YELLOW}Cleaning cache...${NC}"
pnpm store prune

# 重新安装依赖
echo -e "${YELLOW}Reinstalling dependencies...${NC}"
pnpm install

# 运行测试
echo -e "${YELLOW}Running tests...${NC}"
pnpm test

# 检查测试结果
if [ $? -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
else
    echo -e "${RED}Tests failed! Please check the test results.${NC}"
    exit 1
fi

# 更新完成
echo -e "${GREEN}LangChain dependencies updated successfully!${NC}" 