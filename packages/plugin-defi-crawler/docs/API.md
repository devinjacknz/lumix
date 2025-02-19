# DeFi 爬虫插件 API 文档

## 概述

DeFi 爬虫插件提供了一套完整的 API 来抓取和分析 DeFi 协议的数据。支持多个主流 DeFi 协议，包括:

- Uniswap V2/V3
- SushiSwap
- PancakeSwap
- Curve
- Aave
- Raydium
- Orca

## 安装

```bash
pnpm add @lumix/plugin-defi-crawler
```

## 基础用法

```typescript
import { DeFiCrawlerPlugin } from '@lumix/plugin-defi-crawler';

const crawler = new DeFiCrawlerPlugin({
  chains: ['ethereum', 'solana', 'base'],
  protocols: ['uniswap', 'curve', 'aave'],
  interval: 60000, // 1分钟
  maxConcurrency: 5
});

// 初始化插件
await crawler.initialize();

// 获取协议信息
const protocol = await crawler.getProtocolInfo('uniswap');

// 获取流动性池列表
const pools = await crawler.getLiquidityPools('uniswap');

// 分析合约
const analysis = await crawler.analyzeContract('0x...');
```

## API 参考

### DeFiCrawlerPlugin

#### 构造函数

```typescript
constructor(config: CrawlerConfig)
```

配置参数:
- `chains`: 支持的链列表
- `protocols`: 支持的协议列表
- `interval`: 数据更新间隔(毫秒)
- `maxConcurrency`: 最大并发请求数
- `dataProviders`: 数据源配置
  - `defiLlama`: 是否启用 DefiLlama
  - `coingecko`: 是否启用 CoinGecko

#### 方法

##### initialize()

初始化插件。

```typescript
async initialize(): Promise<void>
```

##### getProtocolInfo()

获取协议信息。

```typescript
async getProtocolInfo(protocol: string): Promise<DeFiProtocol>
```

返回:
- `chain`: 链名称
- `name`: 协议名称
- `contractAddress`: 合约地址
- `tvl`: 总锁仓量
- `risks`: 风险评估
- `liquidityPools`: 流动性池列表
- `governance`: 治理信息
- `createdAt`: 创建时间
- `updatedAt`: 更新时间

##### getLiquidityPools()

获取流动性池列表。

```typescript
async getLiquidityPools(protocol: string): Promise<LiquidityPool[]>
```

返回:
- `pair`: 交易对
- `volume24h`: 24小时交易量
- `feeRate`: 手续费率
- `tvl`: 总锁仓量
- `apy`: 年化收益率
- `analysis`: 池子分析
  - `price`: 当前价格
  - `depth`: 流动性深度
  - `impermanentLoss`: 无常损失

##### analyzeContract()

分析智能合约。

```typescript
async analyzeContract(address: string): Promise<ContractAnalysis>
```

返回:
- `bytecodeAnalysis`: 字节码分析
- `securityAnalysis`: 安全性分析
- `riskAssessment`: 风险评估
- `aiAnalysis`: AI 分析结果

##### getTokenMetrics()

获取代币指标。

```typescript
async getTokenMetrics(address: string): Promise<TokenMetrics>
```

返回:
- `price`: 当前价格
- `volume24h`: 24小时交易量
- `marketCap`: 市值
- `holders`: 持有人数
- `priceChange`: 价格变化
- `socialMetrics`: 社交指标

##### getLiquidityAnalysis()

分析流动性。

```typescript
async getLiquidityAnalysis(address: string): Promise<LiquidityAnalysis>
```

返回:
- `totalLiquidity`: 总流动性
- `liquidityDepth`: 流动性深度
- `concentrationRisk`: 集中度风险
- `poolDistribution`: 池子分布
- `historicalLiquidity`: 历史流动性

##### getMarketMetrics()

获取市场指标。

```typescript
async getMarketMetrics(address: string): Promise<MarketMetrics>
```

返回:
- `volatility`: 波动率
- `correlation`: 相关性
- `momentum`: 动量
- `tradingVolume`: 交易量
- `marketSentiment`: 市场情绪

### 事件

插件会触发以下事件:

#### defi:analysis

当完成协议分析时触发。

```typescript
{
  type: 'TVL_CHANGE' | 'VOLUME_SPIKE' | 'SECURITY_ALERT' | 'PRICE_MOVEMENT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: number;
  protocol: string;
  chain: Chain;
  data: any;
}
```

#### defi:risk

当检测到风险时触发。

```typescript
{
  type: string;
  severity: string;
  message: string;
  protocol: string;
  timestamp: number;
}
```

#### defi:liquidity

当流动性发生重大变化时触发。

```typescript
{
  type: string;
  pool: string;
  change: number;
  timestamp: number;
}
```

## 错误处理

插件使用标准的 Error 类型抛出错误。常见错误包括:

- `ProtocolNotFoundError`: 协议不存在
- `ChainNotSupportedError`: 链不支持
- `ContractNotFoundError`: 合约不存在
- `APIError`: API 调用错误
- `ValidationError`: 参数验证错误

## 性能考虑

- 使用缓存减少 RPC 调用
- 批量获取数据减少请求次数
- 并发控制避免请求过载
- 数据压缩减少存储空间

## 示例

### 监控 TVL 变化

```typescript
crawler.on('defi:analysis', (event) => {
  if (event.type === 'TVL_CHANGE' && event.severity === 'HIGH') {
    console.log(`检测到 ${event.protocol} TVL 发生重大变化`);
    console.log(`变化量: ${event.data.change}`);
    console.log(`当前 TVL: ${event.data.currentTVL}`);
  }
});
```

### 分析流动性池

```typescript
const pools = await crawler.getLiquidityPools('uniswap');
for (const pool of pools) {
  const analysis = await crawler.getLiquidityAnalysis(pool.address);
  console.log(`池子 ${pool.pair} 分析结果:`);
  console.log(`- 流动性深度: ${analysis.liquidityDepth}`);
  console.log(`- 集中度风险: ${analysis.concentrationRisk}`);
}
```

### 风险监控

```typescript
crawler.on('defi:risk', (event) => {
  if (event.severity === 'CRITICAL') {
    console.log(`警告: ${event.protocol} 发现严重风险`);
    console.log(`风险描述: ${event.message}`);
    // 执行紧急响应
    crawler.triggerEmergencyResponse(event);
  }
});
``` 