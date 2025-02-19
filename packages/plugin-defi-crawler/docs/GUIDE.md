# DeFi 爬虫插件使用指南

## 目录

1. [简介](#简介)
2. [安装配置](#安装配置)
3. [基本功能](#基本功能)
4. [高级功能](#高级功能)
5. [最佳实践](#最佳实践)
6. [故障排除](#故障排除)

## 简介

DeFi 爬虫插件是一个强大的工具，用于抓取和分析 DeFi 协议的数据。它支持:

- 多链数据抓取 (Ethereum、Solana、Base)
- 多协议支持 (Uniswap、Curve、Aave 等)
- 实时数据监控
- 风险分析
- 性能分析
- 自动化报告

## 安装配置

### 安装

```bash
# 使用 pnpm
pnpm add @lumix/plugin-defi-crawler

# 使用 npm
npm install @lumix/plugin-defi-crawler

# 使用 yarn
yarn add @lumix/plugin-defi-crawler
```

### 基础配置

```typescript
import { DeFiCrawlerPlugin } from '@lumix/plugin-defi-crawler';

const crawler = new DeFiCrawlerPlugin({
  // 支持的链
  chains: ['ethereum', 'solana', 'base'],
  
  // 支持的协议
  protocols: ['uniswap', 'curve', 'aave'],
  
  // 更新间隔 (毫秒)
  interval: 60000,
  
  // 最大并发请求数
  maxConcurrency: 5,
  
  // 数据源配置
  dataProviders: {
    defiLlama: true,
    coingecko: true
  }
});

// 初始化插件
await crawler.initialize();
```

### 环境变量

在 `.env` 文件中配置:

```bash
# RPC 节点
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
BASE_RPC_URL=https://mainnet.base.org

# API 密钥
DEFILLAMA_API_KEY=your_api_key
COINGECKO_API_KEY=your_api_key

# 数据库配置
DB_TYPE=sqlite
DB_PATH=./data/defi.db

# 缓存配置
CACHE_ENABLED=true
CACHE_TTL=3600
```

## 基本功能

### 获取协议信息

```typescript
// 获取单个协议信息
const uniswap = await crawler.getProtocolInfo('uniswap');
console.log('Uniswap TVL:', uniswap.tvl);

// 获取所有支持的协议信息
const protocols = await crawler.getAllProtocols();
```

### 分析流动性池

```typescript
// 获取协议的所有流动性池
const pools = await crawler.getLiquidityPools('uniswap');

// 分析特定池子
const pool = pools[0];
const analysis = await crawler.getLiquidityAnalysis(pool.address);

console.log('流动性深度:', analysis.liquidityDepth);
console.log('集中度风险:', analysis.concentrationRisk);
```

### 监控风险

```typescript
// 监听风险事件
crawler.on('defi:risk', (event) => {
  if (event.severity === 'CRITICAL') {
    sendAlert({
      title: `发现严重风险: ${event.protocol}`,
      message: event.message,
      level: 'critical'
    });
  }
});

// 定期风险扫描
await crawler.scheduledRiskScan({
  interval: '1h',
  protocols: ['aave', 'curve'],
  riskTypes: ['liquidity', 'security', 'price']
});
```

## 高级功能

### 自定义数据源

```typescript
class CustomDataProvider implements DataProvider {
  async getPrice(token: string): Promise<number> {
    // 实现自定义价格获取逻辑
  }
  
  async getTVL(protocol: string): Promise<number> {
    // 实现自定义 TVL 获取逻辑
  }
}

// 注册自定义数据源
crawler.registerDataProvider('custom', new CustomDataProvider());
```

### 自定义分析器

```typescript
class CustomAnalyzer implements Analyzer {
  async analyze(data: any): Promise<AnalysisResult> {
    // 实现自定义分析逻辑
  }
  
  async detectAnomalies(data: any): Promise<Anomaly[]> {
    // 实现异常检测逻辑
  }
}

// 注册自定义分析器
crawler.registerAnalyzer('custom', new CustomAnalyzer());
```

### 数据导出

```typescript
// 导出到 CSV
await crawler.exportData({
  format: 'csv',
  protocols: ['uniswap'],
  metrics: ['tvl', 'volume', 'fees'],
  timeRange: {
    start: '2023-01-01',
    end: '2023-12-31'
  },
  outputPath: './data/defi_metrics.csv'
});

// 导出到数据库
await crawler.exportData({
  format: 'sql',
  database: {
    type: 'postgresql',
    connection: process.env.DATABASE_URL
  }
});
```

## 最佳实践

### 性能优化

1. 使用缓存
```typescript
crawler.setCacheConfig({
  enabled: true,
  ttl: 3600,
  maxSize: '1GB',
  storage: 'redis'
});
```

2. 批量请求
```typescript
// 批量获取数据
const results = await crawler.batchProcess([
  { type: 'tvl', protocol: 'uniswap' },
  { type: 'tvl', protocol: 'curve' },
  { type: 'volume', protocol: 'uniswap' }
]);
```

3. 并发控制
```typescript
crawler.setRequestConfig({
  maxConcurrent: 5,
  retryAttempts: 3,
  timeout: 5000
});
```

### 错误处理

```typescript
try {
  const result = await crawler.analyzeProtocol('unknown');
} catch (error) {
  if (error instanceof ProtocolNotFoundError) {
    console.error('协议不存在');
  } else if (error instanceof APIError) {
    console.error('API 调用失败:', error.message);
    // 重试逻辑
  } else {
    console.error('未知错误:', error);
  }
}
```

### 监控告警

```typescript
// 配置告警规则
crawler.setAlertRules([
  {
    type: 'tvl_change',
    condition: 'decrease',
    threshold: 10, // 10%
    interval: '1h',
    action: async (event) => {
      await sendSlackNotification(event);
      await sendEmailAlert(event);
    }
  }
]);

// 配置告警通道
crawler.setAlertChannels({
  slack: {
    webhook: process.env.SLACK_WEBHOOK,
    channel: '#defi-alerts'
  },
  email: {
    smtp: process.env.SMTP_CONFIG,
    recipients: ['team@example.com']
  }
});
```

## 故障排除

### 常见问题

1. RPC 节点连接失败
```typescript
// 配置备用节点
crawler.setRPCConfig({
  ethereum: {
    primary: 'https://mainnet.infura.io/v3/YOUR-KEY',
    fallback: ['https://eth-mainnet.alchemyapi.io/v2/YOUR-KEY']
  }
});
```

2. 数据不一致
```typescript
// 启用数据验证
crawler.enableDataValidation({
  compareWithExternalSources: true,
  maxDeviation: 0.05 // 5%
});
```

3. 性能问题
```typescript
// 启用性能监控
crawler.enablePerformanceMonitoring({
  metrics: ['requestTime', 'cacheHitRate', 'errorRate'],
  logInterval: '5m'
});
```

### 日志级别

```typescript
// 设置日志级别
crawler.setLogLevel('debug');

// 配置日志输出
crawler.setLogConfig({
  console: true,
  file: './logs/defi-crawler.log',
  format: 'json'
});
```

### 诊断工具

```typescript
// 运行诊断
const diagnosis = await crawler.runDiagnostics({
  checkConnectivity: true,
  validateData: true,
  testPerformance: true
});

// 生成健康报告
const report = await crawler.generateHealthReport();
``` 