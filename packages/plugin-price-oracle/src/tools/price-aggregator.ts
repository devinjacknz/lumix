import { Tool } from "langchain/tools";
import { PriceData, TokenPair, PriceSourceType } from "../types";
import { PriceSourceTool } from "./price-source";
import { logger } from "@lumix/core";

export interface PriceAggregatorConfig {
  method: "weighted" | "median" | "mean";
  minSources: number;
  maxDeviation: number;
  sourceWeights?: Record<PriceSourceType, number>;
}

export class PriceAggregatorTool extends Tool {
  name = "price_aggregator";
  description = "Aggregates price data from multiple sources and provides consolidated price information";

  private sources: Map<PriceSourceType, PriceSourceTool>;
  private config: PriceAggregatorConfig;

  constructor(config: PriceAggregatorConfig) {
    super();
    this.sources = new Map();
    this.config = {
      method: "weighted",
      minSources: 2,
      maxDeviation: 0.1,
      sourceWeights: {
        [PriceSourceType.PYTH]: 0.4,
        [PriceSourceType.CHAINLINK]: 0.4,
        [PriceSourceType.HELIUS]: 0.3,
        [PriceSourceType.DEXSCREENER]: 0.2,
        [PriceSourceType.UNISWAP]: 0.3,
        [PriceSourceType.RAYDIUM]: 0.3,
        [PriceSourceType.BINANCE]: 0.3,
        [PriceSourceType.COINGECKO]: 0.2
      },
      ...config
    };
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "aggregate-price":
          return await this.aggregatePrice(params.pair);
        case "add-source":
          this.addSource(params.source);
          return "Source added successfully";
        case "remove-source":
          this.removeSource(params.sourceType);
          return "Source removed successfully";
        case "get-sources":
          return JSON.stringify(Array.from(this.sources.keys()));
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Price Aggregator Tool", error.message);
      }
      throw error;
    }
  }

  private async aggregatePrice(pair: TokenPair): Promise<string> {
    // 获取所有支持的数据源的价格
    const prices = await this.getPricesFromAllSources(pair);

    // 检查是否有足够的数据源
    if (prices.length < this.config.minSources) {
      throw new Error(`Insufficient price sources. Required: ${this.config.minSources}, Got: ${prices.length}`);
    }

    // 根据配置的方法聚合价格
    let aggregatedPrice: number;
    let aggregatedConfidence: number;

    switch (this.config.method) {
      case "weighted":
        const result = this.calculateWeightedPrice(prices);
        aggregatedPrice = result.price;
        aggregatedConfidence = result.confidence;
        break;
      case "median":
        aggregatedPrice = this.calculateMedianPrice(prices);
        aggregatedConfidence = this.calculateAverageConfidence(prices);
        break;
      case "mean":
        aggregatedPrice = this.calculateMeanPrice(prices);
        aggregatedConfidence = this.calculateAverageConfidence(prices);
        break;
      default:
        throw new Error(`Unsupported aggregation method: ${this.config.method}`);
    }

    // 验证价格偏差
    this.validatePriceDeviation(prices, aggregatedPrice);

    return JSON.stringify({
      pair,
      price: aggregatedPrice,
      timestamp: Date.now(),
      source: PriceSourceType.AGGREGATED,
      confidence: aggregatedConfidence,
      metadata: {
        sources: prices.length,
        method: this.config.method
      }
    });
  }

  private async getPricesFromAllSources(pair: TokenPair): Promise<PriceData[]> {
    const promises = Array.from(this.sources.values())
      .map(async source => {
        try {
          const result = await source._call(JSON.stringify({
            action: "get-price",
            pair
          }));
          return JSON.parse(result);
        } catch (error) {
          logger.warn("Price Aggregator Tool", `Failed to get price from source: ${source.name}`);
          return null;
        }
      });

    const results = await Promise.all(promises);
    return results.filter(result => result !== null) as PriceData[];
  }

  private calculateWeightedPrice(prices: PriceData[]): { price: number; confidence: number } {
    let totalWeight = 0;
    let weightedPrice = 0;
    let weightedConfidence = 0;

    prices.forEach(price => {
      const weight = this.config.sourceWeights[price.source] || 0.1;
      totalWeight += weight;
      weightedPrice += price.price * weight;
      weightedConfidence += price.confidence * weight;
    });

    return {
      price: weightedPrice / totalWeight,
      confidence: weightedConfidence / totalWeight
    };
  }

  private calculateMedianPrice(prices: PriceData[]): number {
    const sortedPrices = prices.map(p => p.price).sort((a, b) => a - b);
    const mid = Math.floor(sortedPrices.length / 2);
    
    if (sortedPrices.length % 2 === 0) {
      return (sortedPrices[mid - 1] + sortedPrices[mid]) / 2;
    }
    return sortedPrices[mid];
  }

  private calculateMeanPrice(prices: PriceData[]): number {
    return prices.reduce((sum, p) => sum + p.price, 0) / prices.length;
  }

  private calculateAverageConfidence(prices: PriceData[]): number {
    return prices.reduce((sum, p) => sum + p.confidence, 0) / prices.length;
  }

  private validatePriceDeviation(prices: PriceData[], aggregatedPrice: number): void {
    const maxDeviation = this.config.maxDeviation;

    for (const price of prices) {
      const deviation = Math.abs(price.price - aggregatedPrice) / aggregatedPrice;
      if (deviation > maxDeviation) {
        logger.warn("Price Aggregator Tool", 
          `Price from ${price.source} deviates by ${(deviation * 100).toFixed(2)}% from aggregated price`
        );
      }
    }
  }

  public addSource(source: PriceSourceTool): void {
    this.sources.set(source.name as PriceSourceType, source);
  }

  public removeSource(sourceType: PriceSourceType): void {
    this.sources.delete(sourceType);
  }
} 