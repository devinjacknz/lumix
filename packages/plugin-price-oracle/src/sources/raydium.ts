import { PriceSourceTool, PriceSourceToolConfig } from "../tools/price-source";
import { PriceData, TokenPair, PriceSourceType, ChainType } from "../types";
import { logger } from "@lumix/core";

interface RaydiumPool {
  id: string;
  baseMint: string;
  quoteMint: string;
  lpMint: string;
  baseVault: string;
  quoteVault: string;
  baseReserve: string;
  quoteReserve: string;
  lpSupply: string;
  version: number;
  programId: string;
}

export class RaydiumPriceSource extends PriceSourceTool {
  private pools: Map<string, RaydiumPool>;
  private lastUpdate: number;
  private updateInterval: number;

  constructor(config: Partial<PriceSourceToolConfig> = {}) {
    super({
      type: PriceSourceType.RAYDIUM,
      chains: [ChainType.SOLANA],
      priority: 2,
      weight: 0.3,
      rateLimit: {
        maxRequests: 100,
        interval: 60000 // 1分钟
      },
      ...config
    });

    this.pools = new Map();
    this.lastUpdate = 0;
    this.updateInterval = 300000; // 5分钟更新一次池子信息
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "get-price":
          return await this.getPrice(params.pair);
        case "check-support":
          return JSON.stringify(this.isSupported(params.pair));
        case "get-confidence":
          return JSON.stringify(this.getConfidence());
        case "update-pools":
          await this.updatePools();
          return "Pools updated successfully";
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Raydium Price Source", error.message);
      }
      throw error;
    }
  }

  private async getPrice(pair: TokenPair): Promise<string> {
    // 检查并更新池子信息
    if (Date.now() - this.lastUpdate > this.updateInterval) {
      await this.updatePools();
    }

    // 找到最佳池子
    const pool = await this.findBestPool(pair);
    if (!pool) {
      throw new Error(`No suitable pool found for pair ${pair.baseToken}/${pair.quoteToken}`);
    }

    // 计算价格
    const price = await this.calculatePrice(pool, pair);
    
    // 计算置信度
    const confidence = this.calculateConfidence(pool);

    const priceData: PriceData = {
      pair,
      price,
      timestamp: Date.now(),
      source: PriceSourceType.RAYDIUM,
      confidence,
      metadata: {
        poolId: pool.id,
        version: pool.version,
        lpSupply: pool.lpSupply
      }
    };

    return JSON.stringify(priceData);
  }

  private async updatePools(): Promise<void> {
    try {
      // 这里应该实现从 Raydium API 获取池子信息的逻辑
      // 示例实现
      const pools: RaydiumPool[] = [];
      
      // 更新本地缓存
      this.pools.clear();
      pools.forEach(pool => {
        this.pools.set(pool.id, pool);
      });
      
      this.lastUpdate = Date.now();
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Raydium Price Source", `Failed to update pools: ${error.message}`);
      }
      throw error;
    }
  }

  private async findBestPool(pair: TokenPair): Promise<RaydiumPool | null> {
    let bestPool: RaydiumPool | null = null;
    let maxLiquidity = BigInt(0);

    for (const pool of this.pools.values()) {
      if (this.isPoolMatch(pool, pair)) {
        const liquidity = this.calculatePoolLiquidity(pool);
        if (liquidity > maxLiquidity) {
          maxLiquidity = liquidity;
          bestPool = pool;
        }
      }
    }

    return bestPool;
  }

  private isPoolMatch(pool: RaydiumPool, pair: TokenPair): boolean {
    const isDirectMatch = 
      (pool.baseMint.toLowerCase() === pair.baseToken.toLowerCase() &&
       pool.quoteMint.toLowerCase() === pair.quoteToken.toLowerCase()) ||
      (pool.baseMint.toLowerCase() === pair.quoteToken.toLowerCase() &&
       pool.quoteMint.toLowerCase() === pair.baseToken.toLowerCase());

    return isDirectMatch;
  }

  private calculatePoolLiquidity(pool: RaydiumPool): bigint {
    // 简单地使用 LP 供应量作为流动性指标
    return BigInt(pool.lpSupply);
  }

  private async calculatePrice(pool: RaydiumPool, pair: TokenPair): Promise<number> {
    const baseReserve = BigInt(pool.baseReserve);
    const quoteReserve = BigInt(pool.quoteReserve);
    
    let price = Number(quoteReserve * BigInt(1e9)) / Number(baseReserve);

    // 如果代币顺序相反，需要取倒数
    if (pool.baseMint.toLowerCase() === pair.quoteToken.toLowerCase()) {
      price = 1 / price;
    }

    return price;
  }

  private calculateConfidence(pool: RaydiumPool): number {
    // 基于流动性和其他因素计算置信度
    const baseReserve = BigInt(pool.baseReserve);
    const quoteReserve = BigInt(pool.quoteReserve);
    const totalLiquidity = baseReserve + quoteReserve;
    
    const liquidityScore = Math.min(
      Number(totalLiquidity) / 1e18,
      1
    );

    // 版本因子：较新版本的池子有更高的置信度
    const versionFactor = Math.min(pool.version / 4, 1);

    // 可以添加更多因素来调整置信度
    const baseConfidence = this.getConfidence();
    return Math.min(
      baseConfidence * (0.6 + 0.2 * liquidityScore + 0.2 * versionFactor),
      1
    );
  }
} 