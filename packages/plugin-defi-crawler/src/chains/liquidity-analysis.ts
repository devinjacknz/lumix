import { BaseChain } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { LiquidityAnalyzerTool } from "../tools/liquidity-analyzer";
import { DeFiEventHandlerTool } from "../tools/event-handler";
import { logger } from "@lumix/core";

export interface LiquidityAnalysisInput {
  protocol: string;
  poolAddress?: string;
  tokens?: {
    token0: string;
    token1: string;
  };
  options?: {
    timeframe?: {
      start: number;
      end: number;
    };
    minLiquidityThreshold?: number;
    includeHistoricalData?: boolean;
    includePriceImpact?: boolean;
    maxSlippage?: number;
  };
}

export interface LiquidityAnalysisOutput {
  protocol: string;
  timestamp: number;
  pool?: {
    address: string;
    tokens: {
      address: string;
      symbol: string;
      reserve: string;
      weight: number;
    }[];
    metrics: {
      tvl: number;
      volume24h: number;
      fee: number;
      apy: number;
      utilization: number;
    };
    health: {
      score: number;
      warnings: string[];
    };
  };
  marketDepth?: {
    token0: string;
    token1: string;
    bids: {
      price: string;
      quantity: string;
      total: string;
    }[];
    asks: {
      price: string;
      quantity: string;
      total: string;
    }[];
    summary: {
      midPrice: string;
      spread: string;
      depth: string;
    };
  };
  priceImpact?: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    priceImpact: string;
    effectivePrice: string;
    warning?: string;
  };
  historicalData?: {
    tvl: {
      timestamp: number;
      value: number;
    }[];
    volume: {
      timestamp: number;
      value: number;
    }[];
    fees: {
      timestamp: number;
      value: number;
    }[];
  };
  recommendations: string[];
}

export class LiquidityAnalysisChain extends BaseChain {
  private liquidityAnalyzer: LiquidityAnalyzerTool;
  private eventHandler: DeFiEventHandlerTool;

  constructor(
    liquidityAnalyzer: LiquidityAnalyzerTool,
    eventHandler: DeFiEventHandlerTool
  ) {
    super();
    this.liquidityAnalyzer = liquidityAnalyzer;
    this.eventHandler = eventHandler;
  }

  _chainType(): string {
    return "liquidity_analysis";
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    try {
      const input = values.input as LiquidityAnalysisInput;
      const output: LiquidityAnalysisOutput = {
        protocol: input.protocol,
        timestamp: Date.now(),
        recommendations: []
      };

      // 1. 如果提供了池地址，分析特定池子
      if (input.poolAddress) {
        const poolAnalysis = await this.analyzePool(input);
        output.pool = poolAnalysis;
        output.recommendations.push(...this.generatePoolRecommendations(poolAnalysis));
      }

      // 2. 如果提供了代币对，分析市场深度
      if (input.tokens) {
        const depthAnalysis = await this.analyzeMarketDepth(input);
        output.marketDepth = depthAnalysis;
        output.recommendations.push(...this.generateDepthRecommendations(depthAnalysis));

        // 3. 如果需要，分析价格影响
        if (input.options?.includePriceImpact) {
          const impactAnalysis = await this.analyzePriceImpact(input);
          output.priceImpact = impactAnalysis;
          output.recommendations.push(...this.generateImpactRecommendations(impactAnalysis));
        }
      }

      // 4. 如果需要，获取历史数据
      if (input.options?.includeHistoricalData) {
        output.historicalData = await this.getHistoricalData(input);
        output.recommendations.push(...this.generateHistoricalRecommendations(output.historicalData));
      }

      return { output };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Liquidity Analysis Chain", `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async analyzePool(input: LiquidityAnalysisInput): Promise<any> {
    const result = await this.liquidityAnalyzer._call(
      JSON.stringify({
        action: "analyze-pool",
        poolAddress: input.poolAddress,
        options: {
          minLiquidityThreshold: input.options?.minLiquidityThreshold
        }
      })
    );
    return JSON.parse(result);
  }

  private async analyzeMarketDepth(input: LiquidityAnalysisInput): Promise<any> {
    const result = await this.liquidityAnalyzer._call(
      JSON.stringify({
        action: "get-market-depth",
        token0: input.tokens.token0,
        token1: input.tokens.token1,
        options: input.options
      })
    );
    return JSON.parse(result);
  }

  private async analyzePriceImpact(input: LiquidityAnalysisInput): Promise<any> {
    const result = await this.liquidityAnalyzer._call(
      JSON.stringify({
        action: "estimate-price-impact",
        tokenIn: input.tokens.token0,
        tokenOut: input.tokens.token1,
        amountIn: "1000000", // 示例金额，实际应该根据需求设置
        options: {
          maxSlippage: input.options?.maxSlippage
        }
      })
    );
    return JSON.parse(result);
  }

  private async getHistoricalData(input: LiquidityAnalysisInput): Promise<any> {
    const events = await this.eventHandler._call(
      JSON.stringify({
        action: "get-events",
        protocol: input.protocol,
        timeframe: input.options?.timeframe,
        filter: {
          types: ["liquidity", "volume", "fee"]
        }
      })
    );

    const parsedEvents = JSON.parse(events);
    return this.processHistoricalEvents(parsedEvents);
  }

  private processHistoricalEvents(events: any[]): any {
    const tvl = [];
    const volume = [];
    const fees = [];

    events.forEach(event => {
      switch (event.type) {
        case "liquidity":
          tvl.push({
            timestamp: event.timestamp,
            value: event.data.tvl
          });
          break;
        case "volume":
          volume.push({
            timestamp: event.timestamp,
            value: event.data.volume
          });
          break;
        case "fee":
          fees.push({
            timestamp: event.timestamp,
            value: event.data.fee
          });
          break;
      }
    });

    return { tvl, volume, fees };
  }

  private generatePoolRecommendations(poolAnalysis: any): string[] {
    const recommendations: string[] = [];

    // 检查流动性健康度
    if (poolAnalysis.health.score < 0.7) {
      recommendations.push("Pool health score is low. Consider rebalancing liquidity.");
    }

    // 检查利用率
    if (poolAnalysis.metrics.utilization < 0.3) {
      recommendations.push("Pool utilization is low. Consider adjusting fee parameters.");
    } else if (poolAnalysis.metrics.utilization > 0.8) {
      recommendations.push("Pool utilization is high. Consider adding more liquidity.");
    }

    // 检查 APY
    if (poolAnalysis.metrics.apy < 0) {
      recommendations.push("Pool APY is negative. Review fee structure and incentives.");
    }

    return recommendations;
  }

  private generateDepthRecommendations(depthAnalysis: any): string[] {
    const recommendations: string[] = [];

    // 检查价差
    const spread = parseFloat(depthAnalysis.summary.spread);
    if (spread > 0.01) { // 1% 价差
      recommendations.push("Market spread is high. Consider market making strategies.");
    }

    // 检查深度
    if (parseFloat(depthAnalysis.summary.depth) < 100000) { // 示例阈值
      recommendations.push("Market depth is shallow. Consider adding more liquidity.");
    }

    return recommendations;
  }

  private generateImpactRecommendations(impactAnalysis: any): string[] {
    const recommendations: string[] = [];

    // 检查价格影响
    const impact = parseFloat(impactAnalysis.priceImpact);
    if (impact > 0.01) { // 1% 价格影响
      recommendations.push("High price impact detected. Consider splitting trades.");
    }

    if (impactAnalysis.warning) {
      recommendations.push(`Warning: ${impactAnalysis.warning}`);
    }

    return recommendations;
  }

  private generateHistoricalRecommendations(historicalData: any): string[] {
    const recommendations: string[] = [];

    // 分析 TVL 趋势
    const tvlTrend = this.analyzeTrend(historicalData.tvl);
    if (tvlTrend < 0) {
      recommendations.push("TVL shows declining trend. Monitor liquidity closely.");
    }

    // 分析交易量趋势
    const volumeTrend = this.analyzeTrend(historicalData.volume);
    if (volumeTrend < 0) {
      recommendations.push("Trading volume is decreasing. Consider adjusting incentives.");
    }

    // 分析费用趋势
    const feeTrend = this.analyzeTrend(historicalData.fees);
    if (feeTrend < 0) {
      recommendations.push("Fee generation is declining. Review fee structure.");
    }

    return recommendations;
  }

  private analyzeTrend(data: { timestamp: number; value: number }[]): number {
    if (data.length < 2) return 0;

    const first = data[0].value;
    const last = data[data.length - 1].value;
    return (last - first) / first;
  }
} 