# Lumix DeFi Agent System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/%40lumix%2Fcore.svg)](https://badge.fury.io/js/%40lumix%2Fcore)
[![Build Status](https://github.com/lumix/lumix/workflows/CI/badge.svg)](https://github.com/lumix/lumix/actions)
[![Coverage Status](https://coveralls.io/repos/github/lumix/lumix/badge.svg?branch=main)](https://coveralls.io/github/lumix/lumix?branch=main)

Lumix 是一个基于 Solana 的智能 DeFi 代理系统，提供自然语言交互和自动化 DeFi 操作能力。

## 特性

- 🤖 智能代理系统
  * 基于 LangChain 的自然语言处理
  * 智能交易策略执行
  * 上下文感知对话

- 🔗 区块链集成
  * Helius 实时数据接入
  * 交易监控和通知
  * WebSocket 实时更新

- 🛠 DeFi 工具集
  * 代币余额查询
  * 自动化交易执行
  * 价格监控告警

- 🔒 安全性
  * 类型安全
  * 输入验证
  * 错误处理
  * 速率限制

## 快速开始

### 安装

```bash
# 安装核心包
pnpm add @lumix/core

# 安装代理包
pnpm add @lumix/agent

# 安装 Helius 集成
pnpm add @lumix/helius
```

### 配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
HELIUS_API_KEY=your_helius_api_key
OPENAI_API_KEY=your_openai_api_key
```

### 使用示例

```typescript
import { DeFiAgent } from '@lumix/agent';
import { HeliusClient } from '@lumix/helius';

// 初始化 Helius 客户端
const helius = new HeliusClient({
  apiKey: process.env.HELIUS_API_KEY
});

// 创建 DeFi 代理
const agent = new DeFiAgent({
  model: 'gpt-4',
  tools: [
    new BalanceChecker(helius),
    new SwapExecutor(helius)
  ]
});

// 执行 DeFi 操作
const response = await agent.execute('查询 SOL 余额');

// 对话交互
const chat = await agent.chat('SOL 当前价格是多少？');
```

## 文档

- [API 文档](./docs/api/README.md)
- [贡献指南](./CONTRIBUTING.md)
- [更新日志](./CHANGELOG.md)

## 架构

```
Lumix 系统
├── 核心层 (@lumix/core)
│   ├── 类型和接口
│   ├── 错误处理
│   ├── 事件系统
│   └── 工具函数
│
├── 代理层 (@lumix/agent)
│   ├── LangChain 集成
│   ├── 自然语言处理
│   ├── DeFi 工具
│   └── 内存系统
│
└── 集成层 (@lumix/helius)
    ├── 区块链数据访问
    ├── 交易监控
    ├── WebSocket API
    └── DeFi APIs
```

## 开发

### 构建

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行测试
pnpm test

# 代码风格检查
pnpm lint
```

### 测试覆盖率

```bash
# 运行测试并生成覆盖率报告
pnpm test:coverage
```

## 贡献

我们欢迎社区贡献！请查看[贡献指南](./CONTRIBUTING.md)了解详情。

## 社区

- [Discord](https://discord.gg/lumix)
- [GitHub 讨论](https://github.com/lumix/lumix/discussions)
- [Twitter](https://twitter.com/lumixdefi)

## 路线图

### 1.1.0 (计划中)
- 增强内存管理
- 额外 DeFi 工具
- 性能优化
- 扩展文档

### 1.2.0 (计划中)
- 高级交易策略
- 多链支持
- 改进自然语言处理
- 额外集成选项

### 2.0.0 (计划中)
- 完整架构重设计
- 增强可扩展性
- 高级 AI 能力
- 扩展插件系统

## 许可证

MIT License - 查看 [LICENSE](./LICENSE) 文件了解详情。

## 致谢

感谢以下项目和社区：

- [LangChain](https://github.com/hwchase17/langchainjs)
- [Helius](https://helius.xyz/)
- [Solana](https://solana.com/)
- [OpenAI](https://openai.com/)

## 安全

如果您发现任何安全问题，请发送邮件至 security@lumix.io。
