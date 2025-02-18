import { BaseChain } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { DeFiAnalyzerTool } from "../tools/defi-analyzer";
import { LiquidityAnalyzerTool } from "../tools/liquidity-analyzer";
import { DeFiEventHandlerTool } from "../tools/event-handler";
import { AnalysisReport, DeFiEvent } from "../types";
import { logger } from "@lumix/core";

export interface ProtocolAnalysisInput {
  protocol: string;
  timeframe?: {
    start: number;
    end: number;
  };
  options?: {
    includeEvents?: boolean;
    includeLiquidity?: boolean;
    eventTypes?: string[];
    minLiquidityThreshold?: number;
    riskMetrics?: string[];
  };
}

export interface ProtocolAnalysisOutput {
  protocol: string;
  timestamp: number;
  analysis: AnalysisReport;
  events?: DeFiEvent[];
  liquidity?: {
    pools: any[];
    metrics: any;
    recommendations: string[];
  };
  risk: {
    score: number;
    level: string;
    warnings: string[];
    recommendations: string[];
  };
}

export class ProtocolAnalysisChain extends BaseChain {
  private defiAnalyzer: DeFiAnalyzerTool;
  private liquidityAnalyzer: LiquidityAnalyzerTool;
  private eventHandler: DeFiEventHandlerTool;

  constructor(
    defiAnalyzer: DeFiAnalyzerTool,
    liquidityAnalyzer: LiquidityAnalyzerTool,
    eventHandler: DeFiEventHandlerTool
  ) {
    super();
    this.defiAnalyzer = defiAnalyzer;
    this.liquidityAnalyzer = liquidityAnalyzer;
    this.eventHandler = eventHandler;
  }

  _chainType(): string {
    return "protocol_analysis";
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    try {
      const input = values.input as ProtocolAnalysisInput;
      const output: ProtocolAnalysisOutput = {
        protocol: input.protocol,
        timestamp: Date.now(),
        analysis: null,
        risk: null
      };

      // 1. 获取协议分析
      const analysisResult = await this.defiAnalyzer._call(
        JSON.stringify({
          action: "analyze-protocol",
          protocol: input.protocol,
          options: input.options
        })
      );
      output.analysis = JSON.parse(analysisResult);

      // 2. 评估风险
      const riskResult = await this.defiAnalyzer._call(
        JSON.stringify({
          action: "assess-risk",
          protocol: input.protocol,
          metrics: input.options?.riskMetrics
        })
      );
      output.risk = JSON.parse(riskResult);

      // 3. 如果需要，获取事件数据
      if (input.options?.includeEvents) {
        const eventsResult = await this.eventHandler._call(
          JSON.stringify({
            action: "get-events",
            protocol: input.protocol,
            timeframe: input.timeframe,
            filter: {
              types: input.options.eventTypes
            }
          })
        );
        output.events = JSON.parse(eventsResult);
      }

      // 4. 如果需要，分析流动性
      if (input.options?.includeLiquidity) {
        // 获取协议的所有流动性池
        const pools = await this.getPools(input.protocol);
        
        // 分析每个池子
        const poolAnalyses = await Promise.all(
          pools.map(async pool => {
            const analysisResult = await this.liquidityAnalyzer._call(
              JSON.stringify({
                action: "analyze-pool",
                poolAddress: pool.address,
                options: {
                  minLiquidityThreshold: input.options.minLiquidityThreshold
                }
              })
            );
            return JSON.parse(analysisResult);
          })
        );

        output.liquidity = {
          pools: poolAnalyses,
          metrics: this.aggregateLiquidityMetrics(poolAnalyses),
          recommendations: this.generateLiquidityRecommendations(poolAnalyses)
        };
      }

      return { output };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Protocol Analysis Chain", `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getPools(protocol: string): Promise<any[]> {
    // 实现获取协议流动性池列表的逻辑
    return [];
  }

  private aggregateLiquidityMetrics(poolAnalyses: any[]): any {
    return {
      totalTVL: poolAnalyses.reduce((sum, pool) => sum + pool.metrics.tvl, 0),
      totalVolume24h: poolAnalyses.reduce((sum, pool) => sum + pool.metrics.volume24h, 0),
      averageAPY: poolAnalyses.reduce((sum, pool) => sum + pool.metrics.apy, 0) / poolAnalyses.length,
      averageUtilization: poolAnalyses.reduce((sum, pool) => sum + pool.metrics.utilization, 0) / poolAnalyses.length,
      healthScore: this.calculateHealthScore(poolAnalyses)
    };
  }

  private calculateHealthScore(poolAnalyses: any[]): number {
    // 实现健康度评分计算逻辑
    return 0;
  }

  private generateLiquidityRecommendations(poolAnalyses: any[]): string[] {
    const recommendations: string[] = [];

    // 分析流动性分布
    const tvlDistribution = this.analyzeTVLDistribution(poolAnalyses);
    if (tvlDistribution.isConcentrated) {
      recommendations.push("Consider redistributing liquidity across more pools to reduce concentration risk");
    }

    // 分析利用率
    const utilizationIssues = this.analyzeUtilization(poolAnalyses);
    recommendations.push(...utilizationIssues);

    // 分析收益率
    const apyIssues = this.analyzeAPY(poolAnalyses);
    recommendations.push(...apyIssues);

    return recommendations;
  }

  private analyzeTVLDistribution(poolAnalyses: any[]): { isConcentrated: boolean } {
    // 实现 TVL 分布分析逻辑
    return { isConcentrated: false };
  }

  private analyzeUtilization(poolAnalyses: any[]): string[] {
    const recommendations: string[] = [];
    
    // 检查低利用率的池子
    const lowUtilizationPools = poolAnalyses.filter(pool => pool.metrics.utilization < 0.3);
    if (lowUtilizationPools.length > 0) {
      recommendations.push("Some pools have low utilization. Consider adjusting incentives or parameters.");
    }

    // 检查高利用率的池子
    const highUtilizationPools = poolAnalyses.filter(pool => pool.metrics.utilization > 0.8);
    if (highUtilizationPools.length > 0) {
      recommendations.push("Some pools have very high utilization. Consider increasing liquidity to reduce risk.");
    }

    return recommendations;
  }

  private analyzeAPY(poolAnalyses: any[]): string[] {
    const recommendations: string[] = [];

    // 检查异常高的 APY
    const highAPYPools = poolAnalyses.filter(pool => pool.metrics.apy > 100);
    if (highAPYPools.length > 0) {
      recommendations.push("Some pools have unusually high APY. Verify sustainability and potential risks.");
    }

    // 检查负收益率
    const negativeAPYPools = poolAnalyses.filter(pool => pool.metrics.apy < 0);
    if (negativeAPYPools.length > 0) {
      recommendations.push("Some pools have negative APY. Consider adjusting parameters or providing additional incentives.");
    }

    return recommendations;
  }
} 