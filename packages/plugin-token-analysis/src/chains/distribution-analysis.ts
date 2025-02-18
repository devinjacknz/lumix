import { BaseChain } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { HolderAnalyzerTool } from "../tools/holder-analyzer";
import { ActivityAnalyzerTool } from "../tools/activity-analyzer";
import { ChainType } from "../types";
import { logger } from "@lumix/core";

export interface DistributionAnalysisInput {
  token: {
    address: string;
    chain: ChainType;
  };
  options?: {
    timeframe?: {
      start: number;
      end: number;
    };
    includeHistorical?: boolean;
    minHoldingValue?: string;
    excludeContracts?: boolean;
  };
}

export interface DistributionAnalysisOutput {
  token: {
    address: string;
    chain: ChainType;
  };
  current: {
    holders: {
      total: number;
      active: number;
      distribution: {
        ranges: {
          range: string;
          holders: number;
          totalBalance: string;
          percentage: number;
        }[];
        topHolders: {
          address: string;
          balance: string;
          percentage: number;
          type: "wallet" | "contract";
          lastActivity: number;
        }[];
        metrics: {
          giniCoefficient: number;
          theilIndex: number;
          palmaRatio: number;
          concentrationRatio: number;
        };
      };
      activity: {
        dailyActive: number;
        weeklyActive: number;
        monthlyActive: number;
        retentionRate: number;
        churnRate: number;
      };
    };
    transfers: {
      volume: {
        total: string;
        average: string;
        median: string;
      };
      count: {
        total: number;
        inflow: number;
        outflow: number;
        internal: number;
      };
      patterns: {
        sizeDistribution: {
          range: string;
          count: number;
          volume: string;
        }[];
        timeDistribution: {
          period: string;
          count: number;
          volume: string;
        }[];
      };
    };
  };
  historical?: {
    periods: {
      timestamp: number;
      metrics: {
        holders: number;
        activeHolders: number;
        giniCoefficient: number;
        concentrationRatio: number;
        volume: string;
        transfers: number;
      };
    }[];
    trends: {
      holderGrowth: number;
      concentrationChange: number;
      activityChange: number;
      volumeChange: number;
    };
  };
  analysis: {
    distribution: {
      status: "CONCENTRATED" | "BALANCED" | "DISPERSED";
      score: number;
      factors: {
        name: string;
        impact: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
        description: string;
      }[];
    };
    activity: {
      status: "HIGH" | "MODERATE" | "LOW";
      score: number;
      patterns: {
        name: string;
        significance: "HIGH" | "MEDIUM" | "LOW";
        description: string;
      }[];
    };
    risks: {
      level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      warnings: string[];
      mitigations: string[];
    };
  };
  timestamp: number;
}

export class DistributionAnalysisChain extends BaseChain {
  private holderAnalyzer: HolderAnalyzerTool;
  private activityAnalyzer: ActivityAnalyzerTool;

  constructor(
    holderAnalyzer: HolderAnalyzerTool,
    activityAnalyzer: ActivityAnalyzerTool
  ) {
    super();
    this.holderAnalyzer = holderAnalyzer;
    this.activityAnalyzer = activityAnalyzer;
  }

  _chainType(): string {
    return "distribution_analysis";
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    try {
      const input = values.input as DistributionAnalysisInput;
      const output: DistributionAnalysisOutput = {
        token: input.token,
        current: null,
        analysis: null,
        timestamp: Date.now()
      };

      // 1. 获取当前分布数据
      output.current = await this.getCurrentDistribution(input);

      // 2. 如果需要，获取历史数据
      if (input.options?.includeHistorical) {
        output.historical = await this.getHistoricalData(input);
      }

      // 3. 生成分析结果
      output.analysis = this.generateAnalysis(output.current, output.historical);

      return { output };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Distribution Analysis Chain", `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getCurrentDistribution(
    input: DistributionAnalysisInput
  ): Promise<DistributionAnalysisOutput["current"]> {
    try {
      // 获取持有者分布
      const holderDist = await this.holderAnalyzer._call(JSON.stringify({
        action: "analyze-distribution",
        token: input.token,
        options: {
          minValue: input.options?.minHoldingValue,
          excludeContracts: input.options?.excludeContracts
        }
      }));

      // 获取活动指标
      const activityMetrics = await this.activityAnalyzer._call(JSON.stringify({
        action: "get-metrics",
        token: input.token,
        options: {
          timeframe: input.options?.timeframe
        }
      }));

      // 获取转账模式
      const activityPattern = await this.activityAnalyzer._call(JSON.stringify({
        action: "analyze-pattern",
        token: input.token
      }));

      const distribution = JSON.parse(holderDist);
      const metrics = JSON.parse(activityMetrics);
      const pattern = JSON.parse(activityPattern);

      return {
        holders: {
          total: distribution.statistics.totalHolders,
          active: distribution.statistics.activeHolders,
          distribution: {
            ranges: distribution.ranges,
            topHolders: distribution.topHolders.map(h => ({
              address: h.address,
              balance: h.balance,
              percentage: h.percentage,
              type: h.isContract ? "contract" : "wallet",
              lastActivity: h.lastTransfer
            })),
            metrics: {
              giniCoefficient: distribution.statistics.giniCoefficient,
              theilIndex: this.calculateTheilIndex(distribution.ranges),
              palmaRatio: this.calculatePalmaRatio(distribution.ranges),
              concentrationRatio: this.calculateConcentrationRatio(distribution.topHolders)
            }
          },
          activity: {
            dailyActive: metrics.uniqueSenders24h + metrics.uniqueReceivers24h,
            weeklyActive: pattern.weeklyDistribution.reduce((sum, d) => sum + d.count, 0),
            monthlyActive: distribution.statistics.activeHolders,
            retentionRate: 0, // TODO: 实现保留率计算
            churnRate: 0 // TODO: 实现流失率计算
          }
        },
        transfers: {
          volume: {
            total: metrics.volume24h,
            average: metrics.averageTransferValue,
            median: "0" // TODO: 实现中位数计算
          },
          count: {
            total: metrics.transactions24h,
            inflow: 0, // TODO: 实现流入统计
            outflow: 0, // TODO: 实现流出统计
            internal: 0 // TODO: 实现内部转账统计
          },
          patterns: {
            sizeDistribution: pattern.transferSizeDistribution,
            timeDistribution: pattern.hourlyDistribution.map(h => ({
              period: `${h.hour}:00`,
              count: h.count,
              volume: h.volume
            }))
          }
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Distribution Analysis Chain",
          `Failed to get current distribution: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getHistoricalData(
    input: DistributionAnalysisInput
  ): Promise<DistributionAnalysisOutput["historical"]> {
    try {
      // 获取历史趋势数据
      const trend = await this.activityAnalyzer._call(JSON.stringify({
        action: "analyze-trend",
        token: input.token,
        options: {
          timeframe: input.options?.timeframe
        }
      }));

      const trendData = JSON.parse(trend);

      // 转换数据格式
      const periods = trendData.dailyMetrics.map(m => ({
        timestamp: new Date(m.date).getTime(),
        metrics: {
          holders: 0, // TODO: 实现历史持有者数量统计
          activeHolders: m.uniqueAddresses,
          giniCoefficient: 0, // TODO: 实现历史基尼系数统计
          concentrationRatio: 0, // TODO: 实现历史集中度统计
          volume: m.volume,
          transfers: m.transactions
        }
      }));

      // 计算变化趋势
      return {
        periods,
        trends: {
          holderGrowth: this.calculateGrowthRate(periods, "holders"),
          concentrationChange: this.calculateGrowthRate(periods, "concentrationRatio"),
          activityChange: this.calculateGrowthRate(periods, "activeHolders"),
          volumeChange: this.calculateVolumeGrowthRate(periods)
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Distribution Analysis Chain",
          `Failed to get historical data: ${error.message}`
        );
      }
      throw error;
    }
  }

  private generateAnalysis(
    current: DistributionAnalysisOutput["current"],
    historical?: DistributionAnalysisOutput["historical"]
  ): DistributionAnalysisOutput["analysis"] {
    // 分析分布状态
    const distributionStatus = this.analyzeDistributionStatus(current, historical);

    // 分析活动状态
    const activityStatus = this.analyzeActivityStatus(current, historical);

    // 评估风险
    const risks = this.assessRisks(current, historical, distributionStatus, activityStatus);

    return {
      distribution: distributionStatus,
      activity: activityStatus,
      risks
    };
  }

  private calculateTheilIndex(ranges: any[]): number {
    if (!ranges || ranges.length === 0) return 0;

    const total = ranges.reduce((sum, r) => sum + Number(r.totalBalance), 0);
    if (total === 0) return 0;

    return ranges.reduce((sum, range) => {
      const share = Number(range.totalBalance) / total;
      if (share <= 0) return sum;
      return sum + share * Math.log(share * ranges.length);
    }, 0);
  }

  private calculatePalmaRatio(ranges: any[]): number {
    if (!ranges || ranges.length < 2) return 0;

    const sortedRanges = [...ranges].sort(
      (a, b) => Number(b.totalBalance) - Number(a.totalBalance)
    );

    const total = sortedRanges.reduce((sum, r) => sum + Number(r.totalBalance), 0);
    if (total === 0) return 0;

    const top10Percent = sortedRanges.slice(0, Math.ceil(ranges.length * 0.1));
    const bottom40Percent = sortedRanges.slice(-Math.floor(ranges.length * 0.4));

    const top10Sum = top10Percent.reduce((sum, r) => sum + Number(r.totalBalance), 0);
    const bottom40Sum = bottom40Percent.reduce((sum, r) => sum + Number(r.totalBalance), 0);

    return bottom40Sum === 0 ? 0 : top10Sum / bottom40Sum;
  }

  private calculateConcentrationRatio(topHolders: any[]): number {
    if (!topHolders || topHolders.length === 0) return 0;
    return topHolders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);
  }

  private calculateGrowthRate(periods: any[], metric: string): number {
    if (!periods || periods.length < 2) return 0;

    const recent = periods[periods.length - 1].metrics[metric];
    const old = periods[0].metrics[metric];

    return old === 0 ? 0 : (recent - old) / old;
  }

  private calculateVolumeGrowthRate(periods: any[]): number {
    if (!periods || periods.length < 2) return 0;

    const recent = BigInt(periods[periods.length - 1].metrics.volume);
    const old = BigInt(periods[0].metrics.volume);

    return old === BigInt(0) ? 0 : Number((recent - old) * BigInt(100) / old) / 100;
  }

  private analyzeDistributionStatus(
    current: DistributionAnalysisOutput["current"],
    historical?: DistributionAnalysisOutput["historical"]
  ): DistributionAnalysisOutput["analysis"]["distribution"] {
    const factors: DistributionAnalysisOutput["analysis"]["distribution"]["factors"] = [];
    let score = 0;

    // 评估基尼系数
    const gini = current.holders.distribution.metrics.giniCoefficient;
    if (gini > 0.8) {
      factors.push({
        name: "gini_coefficient",
        impact: "NEGATIVE",
        description: "Very high inequality in token distribution"
      });
      score -= 2;
    } else if (gini < 0.4) {
      factors.push({
        name: "gini_coefficient",
        impact: "POSITIVE",
        description: "Good token distribution equality"
      });
      score += 2;
    }

    // 评估集中度
    const concentration = current.holders.distribution.metrics.concentrationRatio;
    if (concentration > 0.6) {
      factors.push({
        name: "concentration",
        impact: "NEGATIVE",
        description: "High token concentration in top holders"
      });
      score -= 2;
    } else if (concentration < 0.3) {
      factors.push({
        name: "concentration",
        impact: "POSITIVE",
        description: "Well-distributed token holdings"
      });
      score += 2;
    }

    // 评估帕尔玛比率
    const palma = current.holders.distribution.metrics.palmaRatio;
    if (palma > 3) {
      factors.push({
        name: "palma_ratio",
        impact: "NEGATIVE",
        description: "Large gap between top and bottom holders"
      });
      score -= 1;
    } else if (palma < 1.5) {
      factors.push({
        name: "palma_ratio",
        impact: "POSITIVE",
        description: "Balanced distribution between top and bottom holders"
      });
      score += 1;
    }

    // 评估历史趋势
    if (historical) {
      if (historical.trends.concentrationChange > 0.1) {
        factors.push({
          name: "concentration_trend",
          impact: "NEGATIVE",
          description: "Increasing token concentration over time"
        });
        score -= 1;
      } else if (historical.trends.concentrationChange < -0.1) {
        factors.push({
          name: "concentration_trend",
          impact: "POSITIVE",
          description: "Improving token distribution over time"
        });
        score += 1;
      }
    }

    // 确定状态
    let status: DistributionAnalysisOutput["analysis"]["distribution"]["status"];
    if (score <= -2) status = "CONCENTRATED";
    else if (score >= 2) status = "DISPERSED";
    else status = "BALANCED";

    return {
      status,
      score,
      factors
    };
  }

  private analyzeActivityStatus(
    current: DistributionAnalysisOutput["current"],
    historical?: DistributionAnalysisOutput["historical"]
  ): DistributionAnalysisOutput["analysis"]["activity"] {
    const patterns: DistributionAnalysisOutput["analysis"]["activity"]["patterns"] = [];
    let score = 0;

    // 评估活跃度
    const activeRatio = current.holders.active / current.holders.total;
    if (activeRatio > 0.3) {
      patterns.push({
        name: "active_holders",
        significance: "HIGH",
        description: "High proportion of active holders"
      });
      score += 2;
    } else if (activeRatio < 0.1) {
      patterns.push({
        name: "active_holders",
        significance: "LOW",
        description: "Low holder activity"
      });
      score -= 2;
    }

    // 评估转账模式
    const transferPatterns = current.transfers.patterns.timeDistribution;
    const peakHours = transferPatterns.filter(p => 
      p.count > current.transfers.count.total / transferPatterns.length * 2
    ).length;

    if (peakHours > 6) {
      patterns.push({
        name: "transfer_pattern",
        significance: "HIGH",
        description: "Sustained high activity across multiple hours"
      });
      score += 1;
    } else if (peakHours < 2) {
      patterns.push({
        name: "transfer_pattern",
        significance: "LOW",
        description: "Highly concentrated transfer activity"
      });
      score -= 1;
    }

    // 评估历史趋势
    if (historical) {
      if (historical.trends.activityChange > 0.2) {
        patterns.push({
          name: "activity_trend",
          significance: "HIGH",
          description: "Strong growth in holder activity"
        });
        score += 1;
      } else if (historical.trends.activityChange < -0.2) {
        patterns.push({
          name: "activity_trend",
          significance: "LOW",
          description: "Declining holder activity"
        });
        score -= 1;
      }
    }

    // 确定状态
    let status: DistributionAnalysisOutput["analysis"]["activity"]["status"];
    if (score >= 2) status = "HIGH";
    else if (score <= -2) status = "LOW";
    else status = "MODERATE";

    return {
      status,
      score,
      patterns
    };
  }

  private assessRisks(
    current: DistributionAnalysisOutput["current"],
    historical: DistributionAnalysisOutput["historical"],
    distribution: DistributionAnalysisOutput["analysis"]["distribution"],
    activity: DistributionAnalysisOutput["analysis"]["activity"]
  ): DistributionAnalysisOutput["analysis"]["risks"] {
    const warnings: string[] = [];
    const mitigations: string[] = [];
    let riskLevel: DistributionAnalysisOutput["analysis"]["risks"]["level"] = "LOW";

    // 评估集中度风险
    if (distribution.status === "CONCENTRATED") {
      warnings.push("High token concentration poses centralization risks");
      mitigations.push("Consider implementing token distribution programs");
      riskLevel = "HIGH";
    }

    // 评估活动风险
    if (activity.status === "LOW") {
      warnings.push("Low token activity may indicate lack of utility or interest");
      mitigations.push("Develop token utility and engagement programs");
      riskLevel = Math.max(
        ["LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf(riskLevel),
        ["LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf("MEDIUM")
      );
    }

    // 评估合约持有风险
    const contractHolders = current.holders.distribution.topHolders.filter(
      h => h.type === "contract"
    );
    const contractHoldingRatio = contractHolders.reduce(
      (sum, h) => sum + h.percentage,
      0
    );

    if (contractHoldingRatio > 0.5) {
      warnings.push("High proportion of tokens held in contracts");
      mitigations.push("Audit contract holders and assess potential risks");
      riskLevel = "CRITICAL";
    }

    // 评估趋势风险
    if (historical) {
      if (
        historical.trends.holderGrowth < -0.2 &&
        historical.trends.activityChange < -0.2
      ) {
        warnings.push("Declining holder base and activity");
        mitigations.push("Investigate causes of decline and develop retention strategies");
        riskLevel = Math.max(
          ["LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf(riskLevel),
          ["LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf("HIGH")
        );
      }
    }

    return {
      level: riskLevel,
      warnings,
      mitigations
    };
  }
} 