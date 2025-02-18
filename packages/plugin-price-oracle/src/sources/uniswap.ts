import { PriceSourceTool, PriceSourceToolConfig } from "../tools/price-source";
import { PriceData, TokenPair, PriceSourceType, ChainType } from "../types";
import { logger } from "@lumix/core";

interface UniswapPool {
  address: string;
  token0: string;
  token1: string;
  fee: number;
  liquidity: string;
  sqrtPriceX96: string;
  tick: number;
}

export class UniswapPriceSource extends PriceSourceTool {
  private pools: Map<string, UniswapPool>;
  private lastUpdate: number;
  private updateInterval: number;

  constructor(config: Partial<PriceSourceToolConfig> = {}) {
    super({
      type: PriceSourceType.UNISWAP,
      chains: [ChainType.ETH, ChainType.BASE],
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
        logger.error("Uniswap Price Source", error.message);
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
      source: PriceSourceType.UNISWAP,
      confidence,
      metadata: {
        poolAddress: pool.address,
        fee: pool.fee,
        liquidity: pool.liquidity
      }
    };

    return JSON.stringify(priceData);
  }

  private async updatePools(): Promise<void> {
    try {
      // 这里应该实现从 Uniswap Graph API 或合约获取池子信息的逻辑
      // 示例实现
      const pools: UniswapPool[] = [];
      
      // 更新本地缓存
      this.pools.clear();
      pools.forEach(pool => {
        this.pools.set(pool.address, pool);
      });
      
      this.lastUpdate = Date.now();
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Uniswap Price Source", `Failed to update pools: ${error.message}`);
      }
      throw error;
    }
  }

  private async findBestPool(pair: TokenPair): Promise<UniswapPool | null> {
    let bestPool: UniswapPool | null = null;
    let maxLiquidity = BigInt(0);

    for (const pool of this.pools.values()) {
      if (this.isPoolMatch(pool, pair)) {
        const liquidity = BigInt(pool.liquidity);
        if (liquidity > maxLiquidity) {
          maxLiquidity = liquidity;
          bestPool = pool;
        }
      }
    }

    return bestPool;
  }

  private isPoolMatch(pool: UniswapPool, pair: TokenPair): boolean {
    const isDirectMatch = 
      (pool.token0.toLowerCase() === pair.baseToken.toLowerCase() &&
       pool.token1.toLowerCase() === pair.quoteToken.toLowerCase()) ||
      (pool.token0.toLowerCase() === pair.quoteToken.toLowerCase() &&
       pool.token1.toLowerCase() === pair.baseToken.toLowerCase());

    return isDirectMatch;
  }

  private async calculatePrice(pool: UniswapPool, pair: TokenPair): Promise<number> {
    // 使用 sqrtPriceX96 计算价格
    const sqrtPriceX96 = BigInt(pool.sqrtPriceX96);
    const Q96 = BigInt(2) ** BigInt(96);
    
    let price = Number((sqrtPriceX96 * sqrtPriceX96 * BigInt(1e18)) / (Q96 * Q96));

    // 如果代币顺序相反，需要取倒数
    if (pool.token0.toLowerCase() === pair.quoteToken.toLowerCase()) {
      price = 1 / price;
    }

    return price;
  }

  private calculateConfidence(pool: UniswapPool): number {
    // 基于流动性和其他因素计算置信度
    const liquidityScore = Math.min(
      Number(BigInt(pool.liquidity)) / 1e18,
      1
    );

    // 可以添加更多因素来调整置信度
    const baseConfidence = this.getConfidence();
    return Math.min(baseConfidence * (0.7 + 0.3 * liquidityScore), 1);
  }
} 