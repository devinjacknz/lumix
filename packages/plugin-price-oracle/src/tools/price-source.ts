import { Tool } from "langchain/tools";
import { PriceSourceType, TokenPair, PriceData, ChainType } from "../types";
import { logger } from "@lumix/core";

export interface PriceSourceToolConfig {
  type: PriceSourceType;
  chains: ChainType[];
  priority: number;
  weight: number;
  rateLimit?: {
    maxRequests: number;
    interval: number;
  };
  endpoint?: string;
  apiKey?: string;
}

export class PriceSourceTool extends Tool {
  name = "price_source";
  description = "Retrieves price data from various sources for token pairs";
  
  private config: PriceSourceToolConfig;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;

  constructor(config: PriceSourceToolConfig) {
    super();
    this.config = config;
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      // 检查请求限制
      if (this.config.rateLimit) {
        await this.checkRateLimit();
      }

      switch (params.action) {
        case "get-price":
          return await this.getPrice(params.pair);
        case "check-support":
          return JSON.stringify(this.isSupported(params.pair));
        case "get-confidence":
          return JSON.stringify(this.getConfidence());
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Price Source Tool", error.message);
      }
      throw error;
    }
  }

  private async getPrice(pair: TokenPair): Promise<string> {
    // 实现获取价格的逻辑
    const priceData: PriceData = {
      pair,
      price: 0,
      timestamp: Date.now(),
      source: this.config.type,
      confidence: this.getConfidence()
    };
    return JSON.stringify(priceData);
  }

  private isSupported(pair: TokenPair): boolean {
    return this.config.chains.includes(pair.chain);
  }

  private getConfidence(): number {
    return this.config.weight;
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const { maxRequests, interval } = this.config.rateLimit!;

    // 重置计数器
    if (now - this.lastRequestTime > interval) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }

    // 检查是否超过限制
    if (this.requestCount >= maxRequests) {
      const waitTime = interval - (now - this.lastRequestTime);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestCount = 0;
        this.lastRequestTime = Date.now();
      }
    }

    this.requestCount++;
  }
} 