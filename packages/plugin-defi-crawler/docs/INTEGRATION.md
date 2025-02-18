# DeFi 协议集成指南

## 目录

1. [概述](#概述)
2. [准备工作](#准备工作)
3. [实现适配器](#实现适配器)
4. [测试验证](#测试验证)
5. [性能优化](#性能优化)
6. [最佳实践](#最佳实践)

## 概述

本指南介绍如何为 DeFi 爬虫插件添加新的协议支持。主要步骤包括:

1. 分析协议合约和 ABI
2. 实现协议适配器
3. 添加数据解析逻辑
4. 实现数据验证
5. 添加测试用例
6. 优化性能

## 准备工作

### 1. 收集协议信息

- 合约地址
- ABI 定义
- 数据结构
- API 文档

### 2. 设置开发环境

```bash
# 克隆代码库
git clone https://github.com/your-org/defi-crawler.git

# 安装依赖
pnpm install

# 创建新分支
git checkout -b feature/new-protocol-adapter
```

### 3. 创建适配器文件

```bash
# 创建适配器文件
touch src/protocols/new-protocol.ts

# 创建测试文件
touch src/protocols/__tests__/new-protocol.test.ts
```

## 实现适配器

### 1. 基础结构

```typescript
import { Chain } from '@thirdweb-dev/chains';
import { ProtocolAdapter } from './index';
import { DeFiProtocol, CrawlerConfig, LiquidityPool } from '../types';

// 定义 ABI
const PROTOCOL_ABI = [
  'function getTotalValueLocked() external view returns (uint256)',
  'function getAllPools() external view returns (address[])',
  // ... 其他方法
];

export class NewProtocolAdapter implements ProtocolAdapter {
  public readonly name = 'new-protocol';
  public readonly chain: Chain;
  
  constructor(config: CrawlerConfig) {
    this.chain = config.chains[0];
    // 初始化其他必要的属性
  }

  // 实现接口方法
  public async isSupported(address: string): Promise<boolean> {
    // 实现支持检查逻辑
  }

  public async getProtocolInfo(address: string): Promise<DeFiProtocol> {
    // 实现协议信息获取逻辑
  }

  public async getLiquidityPools(address: string): Promise<LiquidityPool[]> {
    // 实现流动性池获取逻辑
  }

  // ... 实现其他必要的方法
}
```

### 2. 数据获取

```typescript
private async getTVL(address: string): Promise<number> {
  try {
    const contract = new ethers.Contract(address, PROTOCOL_ABI, this.provider);
    const tvl = await contract.getTotalValueLocked();
    return Number(ethers.utils.formatEther(tvl));
  } catch (error) {
    logger.error('NewProtocol', `Failed to get TVL: ${error.message}`);
    return 0;
  }
}

private async getPoolInfo(address: string): Promise<LiquidityPool | null> {
  try {
    // 获取池子数据
    const poolData = await this.fetchPoolData(address);
    
    // 解析数据
    const parsedData = this.parsePoolData(poolData);
    
    // 验证数据
    if (!this.validatePoolData(parsedData)) {
      throw new Error('Invalid pool data');
    }
    
    return {
      pair: parsedData.pair,
      volume24h: parsedData.volume,
      feeRate: parsedData.fee,
      tvl: parsedData.tvl,
      apy: parsedData.apy,
      analysis: {
        price: parsedData.price,
        depth: parsedData.depth,
        impermanentLoss: await this.calculateImpermanentLoss(parsedData)
      }
    };
  } catch (error) {
    logger.error('NewProtocol', `Failed to get pool info: ${error.message}`);
    return null;
  }
}
```

### 3. 数据验证

```typescript
private validatePoolData(data: any): boolean {
  // 检查必要字段
  const requiredFields = ['pair', 'volume', 'fee', 'tvl', 'apy'];
  for (const field of requiredFields) {
    if (!(field in data)) {
      logger.error('NewProtocol', `Missing required field: ${field}`);
      return false;
    }
  }

  // 验证数值范围
  if (data.fee < 0 || data.fee > 1) {
    logger.error('NewProtocol', 'Invalid fee rate');
    return false;
  }

  if (data.tvl < 0) {
    logger.error('NewProtocol', 'Invalid TVL');
    return false;
  }

  return true;
}
```

### 4. 错误处理

```typescript
private async safeCall<T>(
  operation: () => Promise<T>,
  errorMessage: string
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    logger.error('NewProtocol', `${errorMessage}: ${error.message}`);
    return null;
  }
}

private async retryOperation<T>(
  operation: () => Promise<T>,
  retries: number = 3
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  
  throw lastError;
}
```

## 测试验证

### 1. 单元测试

```typescript
import { NewProtocolAdapter } from '../new-protocol';

describe('NewProtocolAdapter', () => {
  let adapter: NewProtocolAdapter;
  
  beforeEach(() => {
    adapter = new NewProtocolAdapter(mockConfig);
  });

  describe('isSupported', () => {
    it('should return true for supported addresses', async () => {
      const result = await adapter.isSupported(VALID_ADDRESS);
      expect(result).toBe(true);
    });

    it('should return false for unsupported addresses', async () => {
      const result = await adapter.isSupported(INVALID_ADDRESS);
      expect(result).toBe(false);
    });
  });

  describe('getProtocolInfo', () => {
    it('should return correct protocol info', async () => {
      const info = await adapter.getProtocolInfo(PROTOCOL_ADDRESS);
      expect(info.name).toBe('New Protocol');
      expect(info.tvl).toBeGreaterThan(0);
      expect(info.risks).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      // 模拟错误情况
      mockProvider.getCode.mockRejectedValue(new Error('RPC error'));
      
      await expect(adapter.getProtocolInfo(PROTOCOL_ADDRESS))
        .rejects
        .toThrow('Failed to get protocol info');
    });
  });
});
```

### 2. 集成测试

```typescript
describe('Integration Tests', () => {
  it('should fetch real protocol data', async () => {
    const adapter = new NewProtocolAdapter({
      chains: ['ethereum'],
      rpcUrl: process.env.ETH_RPC_URL
    });

    const info = await adapter.getProtocolInfo(MAINNET_ADDRESS);
    expect(info).toBeDefined();
    expect(info.tvl).toBeGreaterThan(0);
  });

  it('should handle network issues', async () => {
    const adapter = new NewProtocolAdapter({
      chains: ['ethereum'],
      rpcUrl: 'invalid-url'
    });

    await expect(adapter.getProtocolInfo(MAINNET_ADDRESS))
      .rejects
      .toThrow();
  });
});
```

## 性能优化

### 1. 缓存策略

```typescript
private cache: Map<string, { data: any; timestamp: number }>;
private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟

private getFromCache<T>(key: string): T | null {
  const cached = this.cache.get(key);
  if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
    return cached.data as T;
  }
  return null;
}

private setCache(key: string, data: any): void {
  this.cache.set(key, {
    data,
    timestamp: Date.now()
  });
}
```

### 2. 批量请求

```typescript
private async batchRequest<T>(
  addresses: string[],
  operation: (address: string) => Promise<T>
): Promise<T[]> {
  const batchSize = 10;
  const results: T[] = [];
  
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(address => operation(address))
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

### 3. 数据压缩

```typescript
private compressData(data: any): Buffer {
  return zlib.deflateSync(Buffer.from(JSON.stringify(data)));
}

private decompressData(buffer: Buffer): any {
  return JSON.parse(zlib.inflateSync(buffer).toString());
}
```

## 最佳实践

### 1. 代码组织

- 使用清晰的文件结构
- 分离核心逻辑和辅助函数
- 使用适当的设计模式

### 2. 错误处理

- 使用自定义错误类型
- 提供详细的错误信息
- 实现优雅的降级策略

### 3. 日志记录

- 记录关键操作
- 包含足够的上下文信息
- 使用适当的日志级别

### 4. 安全考虑

- 验证输入数据
- 处理敏感信息
- 实现速率限制

### 5. 可维护性

- 添加详细注释
- 编写完整的测试
- 保持代码简洁 