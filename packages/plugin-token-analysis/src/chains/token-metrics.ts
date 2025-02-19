import { BaseChain } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { TokenAnalyzerTool } from "../tools/token-analyzer";
import { HolderAnalyzerTool } from "../tools/holder-analyzer";
import { ActivityAnalyzerTool } from "../tools/activity-analyzer";
import { ChainType } from "../types";
import { logger } from "@lumix/core";

export interface TokenMetricsInput {
  token: {
    address: string;
    chain: ChainType;
  };
  options?: {
    includeHolderAnalysis?: boolean;
    includeActivityAnalysis?: boolean;
    timeframe?: {
      start: number;
      end: number;
    };
  };
}

export interface TokenMetricsOutput {
  token: {
    address: string;
    chain: ChainType;
    name: string;
    symbol: string;
    decimals: number;
  };
  metrics: {
    supply: {
      total: string;
      circulating: string;
      burned: string;
      locked: string;
    };
    market: {
      price: number;
      marketCap: number;
      volume24h: number;
      priceChange24h: number;
    };
    holders: {
      total: number;
      active: number;
      distribution: {
        giniCoefficient: number;
        concentrationRatio: number;
        topHolders: {
          address: string;
          balance: string;
          percentage: number;
        }[];
      };
    };
    activity: {
      transactions24h: number;
      volume24h: string;
      uniqueUsers24h: number;
      velocity: number;
      patterns: {
        hourly: {
          peak: number;
          low: number;
          average: number;
        };
        weekly: {
          peak: number;
          low: number;
          average: number;
        };
      };
    };
  };
  analysis: {
    health: {
      score: number;
      grade: "A" | "B" | "C" | "D" | "F";
      factors: {
        name: string;
        score: number;
        weight: number;
        description: string;
      }[];
    };
    risks: {
      level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      score: number;
      warnings: string[];
    };
    recommendations: string[];
  };
  timestamp: number;
}

export class TokenMetricsChain extends BaseChain {
  private tokenAnalyzer: TokenAnalyzerTool;
  private holderAnalyzer: HolderAnalyzerTool;
  private activityAnalyzer: ActivityAnalyzerTool;

  constructor(
    tokenAnalyzer: TokenAnalyzerTool,
    holderAnalyzer: HolderAnalyzerTool,
    activityAnalyzer: ActivityAnalyzerTool
  ) {
    super();
    this.tokenAnalyzer = tokenAnalyzer;
    this.holderAnalyzer = holderAnalyzer;
    this.activityAnalyzer = activityAnalyzer;
  }

  _chainType(): string {
    return "token_metrics";
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    try {
      const input = values.input as TokenMetricsInput;
      const output: TokenMetricsOutput = {
        token: null,
        metrics: null,
        analysis: null,
        timestamp: Date.now()
      };

      // 1. 获取基本代币分析
      const tokenAnalysis = await this.getTokenAnalysis(input.token);
      output.token = tokenAnalysis.token;

      // 2. 获取持有者分析
      const holderAnalysis = input.options?.includeHolderAnalysis
        ? await this.getHolderAnalysis(input.token)
        : null;

      // 3. 获取活动分析
      const activityAnalysis = input.options?.includeActivityAnalysis
        ? await this.getActivityAnalysis(input.token, input.options.timeframe)
        : null;

      // 4. 整合指标
      output.metrics = this.aggregateMetrics(
        tokenAnalysis,
        holderAnalysis,
        activityAnalysis
      );

      // 5. 生成分析结果
      output.analysis = this.generateAnalysis(
        output.metrics,
        tokenAnalysis,
        holderAnalysis,
        activityAnalysis
      );

      return { output };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Token Metrics Chain", `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getTokenAnalysis(token: TokenMetricsInput["token"]): Promise<any> {
    const result = await this.tokenAnalyzer._call(JSON.stringify({
      action: "analyze",
      token
    }));
    return JSON.parse(result);
  }

  private async getHolderAnalysis(token: TokenMetricsInput["token"]): Promise<any> {
    const result = await this.holderAnalyzer._call(JSON.stringify({
      action: "analyze-distribution",
      token
    }));
    return JSON.parse(result);
  }

  private async getActivityAnalysis(
    token: TokenMetricsInput["token"],
    timeframe?: { start: number; end: number }
  ): Promise<any> {
    const metrics = await this.activityAnalyzer._call(JSON.stringify({
      action: "get-metrics",
      token,
      options: { timeframe }
    }));

    const pattern = await this.activityAnalyzer._call(JSON.stringify({
      action: "analyze-pattern",
      token
    }));

    return {
      metrics: JSON.parse(metrics),
      pattern: JSON.parse(pattern)
    };
  }

  private aggregateMetrics(
    tokenAnalysis: any,
    holderAnalysis: any,
    activityAnalysis: any
  ): TokenMetricsOutput["metrics"] {
    return {
      supply: {
        total: tokenAnalysis.metrics.totalSupply,
        circulating: tokenAnalysis.metrics.circulatingSupply,
        burned: "0", // TODO: 实现燃烧量计算
        locked: "0" // TODO: 实现锁仓量计算
      },
      market: {
        price: tokenAnalysis.metrics.price,
        marketCap: tokenAnalysis.metrics.marketCap,
        volume24h: tokenAnalysis.metrics.volume24h,
        priceChange24h: tokenAnalysis.metrics.priceChange24h
      },
      holders: holderAnalysis ? {
        total: holderAnalysis.statistics.totalHolders,
        active: holderAnalysis.statistics.activeHolders,
        distribution: {
          giniCoefficient: holderAnalysis.statistics.giniCoefficient,
          concentrationRatio: this.calculateConcentrationRatio(holderAnalysis.topHolders),
          topHolders: holderAnalysis.topHolders.slice(0, 10).map(h => ({
            address: h.address,
            balance: h.balance,
            percentage: h.percentage
          }))
        }
      } : null,
      activity: activityAnalysis ? {
        transactions24h: activityAnalysis.metrics.transactions24h,
        volume24h: activityAnalysis.metrics.volume24h,
        uniqueUsers24h: activityAnalysis.metrics.uniqueSenders24h + activityAnalysis.metrics.uniqueReceivers24h,
        velocity: activityAnalysis.metrics.velocity,
        patterns: {
          hourly: this.calculatePatternMetrics(activityAnalysis.pattern.hourlyDistribution),
          weekly: this.calculatePatternMetrics(activityAnalysis.pattern.weeklyDistribution)
        }
      } : null
    };
  }

  private calculateConcentrationRatio(topHolders: any[]): number {
    if (!topHolders || topHolders.length === 0) return 0;
    return topHolders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);
  }

  private calculatePatternMetrics(distribution: any[]): {
    peak: number;
    low: number;
    average: number;
  } {
    if (!distribution || distribution.length === 0) {
      return { peak: 0, low: 0, average: 0 };
    }

    const values = distribution.map(d => d.count);
    return {
      peak: Math.max(...values),
      low: Math.min(...values),
      average: values.reduce((sum, v) => sum + v, 0) / values.length
    };
  }

  private generateAnalysis(
    metrics: TokenMetricsOutput["metrics"],
    tokenAnalysis: any,
    holderAnalysis: any,
    activityAnalysis: any
  ): TokenMetricsOutput["analysis"] {
    // 计算健康度分数
    const healthFactors = this.calculateHealthFactors(
      metrics,
      tokenAnalysis,
      holderAnalysis,
      activityAnalysis
    );

    const healthScore = healthFactors.reduce(
      (score, factor) => score + factor.score * factor.weight,
      0
    );

    // 确定健康度等级
    const healthGrade = this.determineHealthGrade(healthScore);

    // 生成风险评估
    const risks = this.assessRisks(
      metrics,
      tokenAnalysis,
      holderAnalysis,
      activityAnalysis
    );

    // 生成建议
    const recommendations = this.generateRecommendations(
      metrics,
      healthFactors,
      risks
    );

    return {
      health: {
        score: healthScore,
        grade: healthGrade,
        factors: healthFactors
      },
      risks,
      recommendations
    };
  }

  private calculateHealthFactors(
    metrics: TokenMetricsOutput["metrics"],
    tokenAnalysis: any,
    holderAnalysis: any,
    activityAnalysis: any
  ): TokenMetricsOutput["analysis"]["health"]["factors"] {
    const factors: TokenMetricsOutput["analysis"]["health"]["factors"] = [];

    // 市场表现
    if (metrics.market) {
      factors.push({
        name: "market_performance",
        score: this.normalizeScore(metrics.market.priceChange24h, -0.5, 0.5),
        weight: 0.2,
        description: "Token's market performance in the last 24 hours"
      });
    }

    // 持有者分布
    if (metrics.holders) {
      factors.push({
        name: "holder_distribution",
        score: 1 - metrics.holders.distribution.giniCoefficient,
        weight: 0.3,
        description: "Token holder distribution equality"
      });

      factors.push({
        name: "holder_activity",
        score: metrics.holders.active / metrics.holders.total,
        weight: 0.2,
        description: "Percentage of active token holders"
      });
    }

    // 交易活动
    if (metrics.activity) {
      factors.push({
        name: "trading_activity",
        score: this.normalizeScore(metrics.activity.velocity, 0, 1000),
        weight: 0.2,
        description: "Token's trading velocity and activity"
      });
    }

    // 供应分布
    if (metrics.supply) {
      const circulatingRatio = Number(BigInt(metrics.supply.circulating)) / 
        Number(BigInt(metrics.supply.total));
      
      factors.push({
        name: "supply_distribution",
        score: this.normalizeScore(circulatingRatio, 0.1, 0.9),
        weight: 0.1,
        description: "Token's supply distribution and circulation"
      });
    }

    return factors;
  }

  private normalizeScore(value: number, min: number, max: number): number {
    if (value <= min) return 0;
    if (value >= max) return 1;
    return (value - min) / (max - min);
  }

  private determineHealthGrade(score: number): TokenMetricsOutput["analysis"]["health"]["grade"] {
    if (score >= 0.8) return "A";
    if (score >= 0.6) return "B";
    if (score >= 0.4) return "C";
    if (score >= 0.2) return "D";
    return "F";
  }

  private assessRisks(
    metrics: TokenMetricsOutput["metrics"],
    tokenAnalysis: any,
    holderAnalysis: any,
    activityAnalysis: any
  ): TokenMetricsOutput["analysis"]["risks"] {
    const warnings: string[] = [];
    let riskScore = 0;

    // 检查持有者集中度
    if (metrics.holders) {
      const concentrationRatio = metrics.holders.distribution.concentrationRatio;
      if (concentrationRatio > 0.8) {
        warnings.push("Extremely high token concentration in top holders");
        riskScore += 3;
      } else if (concentrationRatio > 0.6) {
        warnings.push("High token concentration in top holders");
        riskScore += 2;
      }
    }

    // 检查活动模式
    if (metrics.activity) {
      if (metrics.activity.velocity < 0.1) {
        warnings.push("Very low token velocity indicates potential stagnation");
        riskScore += 2;
      }
      if (metrics.activity.uniqueUsers24h < 100) {
        warnings.push("Low daily active users");
        riskScore += 1;
      }
    }

    // 检查市场表现
    if (metrics.market) {
      if (metrics.market.priceChange24h < -0.2) {
        warnings.push("Significant price decline in the last 24 hours");
        riskScore += 2;
      }
      if (metrics.market.volume24h < 1000) {
        warnings.push("Low trading volume indicates potential liquidity issues");
        riskScore += 1;
      }
    }

    // 确定风险等级
    let level: TokenMetricsOutput["analysis"]["risks"]["level"] = "LOW";
    if (riskScore >= 6) level = "CRITICAL";
    else if (riskScore >= 4) level = "HIGH";
    else if (riskScore >= 2) level = "MEDIUM";

    return {
      level,
      score: riskScore,
      warnings
    };
  }

  private generateRecommendations(
    metrics: TokenMetricsOutput["metrics"],
    healthFactors: TokenMetricsOutput["analysis"]["health"]["factors"],
    risks: TokenMetricsOutput["analysis"]["risks"]
  ): string[] {
    const recommendations: string[] = [];

    // 基于健康因素生成建议
    healthFactors.forEach(factor => {
      if (factor.score < 0.4) {
        switch (factor.name) {
          case "market_performance":
            recommendations.push("Consider implementing market making strategies to improve price stability");
            break;
          case "holder_distribution":
            recommendations.push("Implement initiatives to encourage wider token distribution");
            break;
          case "holder_activity":
            recommendations.push("Develop programs to increase holder engagement and activity");
            break;
          case "trading_activity":
            recommendations.push("Consider adding trading incentives to increase market activity");
            break;
          case "supply_distribution":
            recommendations.push("Review token economics to optimize supply distribution");
            break;
        }
      }
    });

    // 基于风险生成建议
    if (risks.level === "CRITICAL" || risks.level === "HIGH") {
      recommendations.push("Conduct thorough security audit and risk assessment");
      recommendations.push("Implement additional monitoring and control measures");
    }

    // 添加特定指标建议
    if (metrics.holders) {
      if (metrics.holders.distribution.concentrationRatio > 0.6) {
        recommendations.push("Consider implementing measures to reduce token concentration");
      }
    }

    if (metrics.activity) {
      if (metrics.activity.velocity < 0.1) {
        recommendations.push("Develop strategies to increase token utility and circulation");
      }
    }

    return recommendations;
  }
} 