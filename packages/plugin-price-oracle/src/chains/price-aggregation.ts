import { BaseChain } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { PriceSourceTool } from "../tools/price-source";
import { PriceAggregatorTool } from "../tools/price-aggregator";
import { DataValidatorTool } from "../tools/data-validator";
import { TokenPair, PriceData, PriceSourceType } from "../types";
import { logger } from "@lumix/core";

export interface PriceAggregationInput {
  pair: TokenPair;
  options?: {
    sources?: PriceSourceType[];
    minSources?: number;
    maxDeviation?: number;
    aggregationMethod?: "weighted" | "median" | "mean";
    validationRules?: string[];
    cacheDuration?: number;
  };
}

export interface PriceAggregationOutput {
  pair: TokenPair;
  timestamp: number;
  aggregatedPrice: number;
  confidence: number;
  sources: {
    name: string;
    price: number;
    confidence: number;
    timestamp: number;
  }[];
  validation: {
    isValid: boolean;
    errors: any[];
    warnings: any[];
  };
  metadata: {
    method: string;
    sourcesUsed: number;
    totalSources: number;
    executionTime: number;
  };
}

export class PriceAggregationChain extends BaseChain {
  private sources: Map<PriceSourceType, PriceSourceTool>;
  private aggregator: PriceAggregatorTool;
  private validator: DataValidatorTool;

  constructor(
    sources: PriceSourceTool[],
    aggregator: PriceAggregatorTool,
    validator: DataValidatorTool
  ) {
    super();
    this.sources = new Map();
    sources.forEach(source => this.sources.set(source.name as PriceSourceType, source));
    this.aggregator = aggregator;
    this.validator = validator;
  }

  _chainType(): string {
    return "price_aggregation";
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    try {
      const input = values.input as PriceAggregationInput;
      const startTime = Date.now();

      // 1. 获取指定数据源的价格
      const selectedSources = input.options?.sources || Array.from(this.sources.keys());
      const sourcePrices = await this.getPricesFromSources(input.pair, selectedSources);

      // 2. 验证每个数据源的价格
      const validatedPrices = await this.validatePrices(sourcePrices);

      // 3. 聚合价格
      const aggregatedResult = await this.aggregateValidPrices(validatedPrices, input.options);

      // 4. 验证聚合结果
      const validationResult = await this.validateAggregatedPrice(aggregatedResult);

      // 5. 准备输出
      const output: PriceAggregationOutput = {
        pair: input.pair,
        timestamp: Date.now(),
        aggregatedPrice: aggregatedResult.price,
        confidence: aggregatedResult.confidence,
        sources: sourcePrices.map(p => ({
          name: p.source,
          price: p.price,
          confidence: p.confidence,
          timestamp: p.timestamp
        })),
        validation: {
          isValid: validationResult.isValid,
          errors: validationResult.validation.errors,
          warnings: validationResult.validation.warnings
        },
        metadata: {
          method: input.options?.aggregationMethod || "weighted",
          sourcesUsed: validatedPrices.length,
          totalSources: selectedSources.length,
          executionTime: Date.now() - startTime
        }
      };

      return { output };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Price Aggregation Chain", `Aggregation failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getPricesFromSources(
    pair: TokenPair,
    sources: PriceSourceType[]
  ): Promise<PriceData[]> {
    const prices: PriceData[] = [];

    for (const sourceType of sources) {
      const source = this.sources.get(sourceType);
      if (!source) continue;

      try {
        const result = await source._call(JSON.stringify({
          action: "get-price",
          pair
        }));
        prices.push(JSON.parse(result));
      } catch (error) {
        logger.warn("Price Aggregation Chain", 
          `Failed to get price from source ${sourceType}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return prices;
  }

  private async validatePrices(prices: PriceData[]): Promise<PriceData[]> {
    const validatedPrices: PriceData[] = [];

    for (const price of prices) {
      try {
        const validationResult = await this.validator._call(JSON.stringify({
          action: "validate",
          data: price
        }));
        const result = JSON.parse(validationResult);
        
        if (result.isValid) {
          validatedPrices.push(price);
        } else {
          logger.warn("Price Aggregation Chain", 
            `Price from ${price.source} failed validation: ${result.validation.errors.map(e => e.message).join(", ")}`
          );
        }
      } catch (error) {
        logger.error("Price Aggregation Chain", 
          `Validation failed for source ${price.source}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return validatedPrices;
  }

  private async aggregateValidPrices(
    prices: PriceData[],
    options?: PriceAggregationInput["options"]
  ): Promise<PriceData> {
    if (prices.length < (options?.minSources || 2)) {
      throw new Error(`Insufficient valid price sources. Required: ${options?.minSources || 2}, Got: ${prices.length}`);
    }

    const aggregationResult = await this.aggregator._call(JSON.stringify({
      action: "aggregate-price",
      prices,
      options: {
        method: options?.aggregationMethod,
        maxDeviation: options?.maxDeviation
      }
    }));

    return JSON.parse(aggregationResult);
  }

  private async validateAggregatedPrice(price: PriceData): Promise<any> {
    const validationResult = await this.validator._call(JSON.stringify({
      action: "validate",
      data: price
    }));

    return JSON.parse(validationResult);
  }
} 