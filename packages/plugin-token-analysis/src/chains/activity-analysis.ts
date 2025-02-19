import { BaseChain } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { ActivityAnalyzerTool } from "../tools/activity-analyzer";
import { HolderAnalyzerTool } from "../tools/holder-analyzer";
import { ChainType } from "../types";
import { logger } from "@lumix/core";

export interface ActivityAnalysisInput {
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
    granularity?: "hourly" | "daily" | "weekly";
    excludeContracts?: boolean;
  };
}

export interface ActivityAnalysisOutput {
  token: {
    address: string;
    chain: ChainType;
  };
  current: {
    metrics: {
      transactions: {
        count24h: number;
        volume24h: string;
        averageSize: string;
        medianSize: string;
        largestSize: string;
      };
      users: {
        active24h: number;
        newUsers24h: number;
        retentionRate: number;
        averageHoldingPeriod: number;
      };
      velocity: {
        daily: number;
        weekly: number;
        monthly: number;
      };
    };
    patterns: {
      temporal: {
        hourly: {
          hour: number;
          transactions: number;
          volume: string;
          uniqueUsers: number;
        }[];
        daily: {
          day: string;
          transactions: number;
          volume: string;
          uniqueUsers: number;
        }[];
        weekly: {
          week: string;
          transactions: number;
          volume: string;
          uniqueUsers: number;
        }[];
      };
      behavioral: {
        userSegments: {
          segment: "whale" | "active" | "regular" | "casual";
          count: number;
          volumeShare: number;
          activityShare: number;
        }[];
        transactionTypes: {
          type: "transfer" | "swap" | "liquidity" | "other";
          count: number;
          volume: string;
          uniqueUsers: number;
        }[];
      };
    };
  };
  historical?: {
    metrics: {
      timestamp: number;
      transactions: number;
      volume: string;
      activeUsers: number;
      velocity: number;
    }[];
    trends: {
      activity: {
        transactionGrowth: number;
        volumeGrowth: number;
        userGrowth: number;
      };
      patterns: {
        seasonality: {
          daily: number;
          weekly: number;
          monthly: number;
        };
        consistency: number;
        volatility: number;
      };
    };
  };
  analysis: {
    activity: {
      level: "HIGH" | "MODERATE" | "LOW";
      score: number;
      factors: {
        name: string;
        impact: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
        description: string;
      }[];
    };
    patterns: {
      type: "HEALTHY" | "NEUTRAL" | "CONCERNING";
      characteristics: {
        name: string;
        significance: "HIGH" | "MEDIUM" | "LOW";
        description: string;
      }[];
    };
    users: {
      diversity: "HIGH" | "MODERATE" | "LOW";
      engagement: "STRONG" | "MODERATE" | "WEAK";
      loyalty: "HIGH" | "MODERATE" | "LOW";
      insights: string[];
    };
    recommendations: {
      priority: "HIGH" | "MEDIUM" | "LOW";
      action: string;
      rationale: string;
      expectedImpact: string;
    }[];
  };
  timestamp: number;
}

export class ActivityAnalysisChain extends BaseChain {
  private activityAnalyzer: ActivityAnalyzerTool;
  private holderAnalyzer: HolderAnalyzerTool;

  constructor(
    activityAnalyzer: ActivityAnalyzerTool,
    holderAnalyzer: HolderAnalyzerTool
  ) {
    super();
    this.activityAnalyzer = activityAnalyzer;
    this.holderAnalyzer = holderAnalyzer;
  }

  _chainType(): string {
    return "activity_analysis";
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    try {
      const input = values.input as ActivityAnalysisInput;
      const output: ActivityAnalysisOutput = {
        token: input.token,
        current: null,
        analysis: null,
        timestamp: Date.now()
      };

      // 1. 获取当前活动数据
      output.current = await this.getCurrentActivity(input);

      // 2. 如果需要，获取历史数据
      if (input.options?.includeHistorical) {
        output.historical = await this.getHistoricalActivity(input);
      }

      // 3. 生成分析结果
      output.analysis = this.generateAnalysis(output.current, output.historical);

      return { output };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Activity Analysis Chain", `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getCurrentActivity(
    input: ActivityAnalysisInput
  ): Promise<ActivityAnalysisOutput["current"]> {
    try {
      // 获取活动指标
      const metrics = await this.activityAnalyzer._call(JSON.stringify({
        action: "get-metrics",
        token: input.token,
        options: {
          timeframe: input.options?.timeframe
        }
      }));

      // 获取活动模式
      const pattern = await this.activityAnalyzer._call(JSON.stringify({
        action: "analyze-pattern",
        token: input.token,
        options: {
          granularity: input.options?.granularity
        }
      }));

      // 获取持有者数据
      const holders = await this.holderAnalyzer._call(JSON.stringify({
        action: "analyze-distribution",
        token: input.token,
        options: {
          excludeContracts: input.options?.excludeContracts
        }
      }));

      const metricsData = JSON.parse(metrics);
      const patternData = JSON.parse(pattern);
      const holderData = JSON.parse(holders);

      return {
        metrics: {
          transactions: {
            count24h: metricsData.transactions24h,
            volume24h: metricsData.volume24h,
            averageSize: metricsData.averageTransferValue,
            medianSize: "0", // TODO: 实现中位数计算
            largestSize: metricsData.largestTransfer
          },
          users: {
            active24h: metricsData.uniqueSenders24h + metricsData.uniqueReceivers24h,
            newUsers24h: 0, // TODO: 实现新用户统计
            retentionRate: 0, // TODO: 实现保留率计算
            averageHoldingPeriod: 0 // TODO: 实现平均持有期计算
          },
          velocity: {
            daily: metricsData.velocity,
            weekly: 0, // TODO: 实现周度流通速度计算
            monthly: 0 // TODO: 实现月度流通速度计算
          }
        },
        patterns: {
          temporal: {
            hourly: patternData.hourlyDistribution.map(h => ({
              hour: h.hour,
              transactions: h.count,
              volume: h.volume,
              uniqueUsers: 0 // TODO: 实现每小时唯一用户统计
            })),
            daily: [], // TODO: 实现日度分布
            weekly: [] // TODO: 实现周度分布
          },
          behavioral: {
            userSegments: this.analyzeUserSegments(holderData),
            transactionTypes: [] // TODO: 实现交易类型分析
          }
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Activity Analysis Chain",
          `Failed to get current activity: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getHistoricalActivity(
    input: ActivityAnalysisInput
  ): Promise<ActivityAnalysisOutput["historical"]> {
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
      const metrics = trendData.dailyMetrics.map(m => ({
        timestamp: new Date(m.date).getTime(),
        transactions: m.transactions,
        volume: m.volume,
        activeUsers: m.uniqueAddresses,
        velocity: m.velocity
      }));

      // 计算趋势
      return {
        metrics,
        trends: {
          activity: {
            transactionGrowth: this.calculateGrowthRate(metrics, "transactions"),
            volumeGrowth: this.calculateVolumeGrowthRate(metrics),
            userGrowth: this.calculateGrowthRate(metrics, "activeUsers")
          },
          patterns: {
            seasonality: this.analyzeSeasonality(metrics),
            consistency: this.calculateConsistency(metrics),
            volatility: this.calculateVolatility(metrics)
          }
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Activity Analysis Chain",
          `Failed to get historical activity: ${error.message}`
        );
      }
      throw error;
    }
  }

  private generateAnalysis(
    current: ActivityAnalysisOutput["current"],
    historical?: ActivityAnalysisOutput["historical"]
  ): ActivityAnalysisOutput["analysis"] {
    // 分析活动水平
    const activity = this.analyzeActivityLevel(current, historical);

    // 分析活动模式
    const patterns = this.analyzeActivityPatterns(current, historical);

    // 分析用户行为
    const users = this.analyzeUserBehavior(current, historical);

    // 生成建议
    const recommendations = this.generateRecommendations(
      activity,
      patterns,
      users,
      historical
    );

    return {
      activity,
      patterns,
      users,
      recommendations
    };
  }

  private analyzeUserSegments(holderData: any): ActivityAnalysisOutput["current"]["patterns"]["behavioral"]["userSegments"] {
    const totalHolders = holderData.statistics.totalHolders;
    const totalVolume = BigInt(holderData.statistics.totalBalance || "0");

    // 按持有量划分用户段
    const segments = [
      { name: "whale", threshold: 0.01 }, // 前1%
      { name: "active", threshold: 0.1 }, // 前10%
      { name: "regular", threshold: 0.5 }, // 前50%
      { name: "casual", threshold: 1 } // 剩余
    ];

    const sortedHolders = [...holderData.topHolders].sort(
      (a, b) => Number(BigInt(b.balance) - BigInt(a.balance))
    );

    return segments.map(({ name, threshold }) => {
      const count = Math.floor(totalHolders * threshold);
      const holders = sortedHolders.slice(0, count);
      const volume = holders.reduce((sum, h) => sum + BigInt(h.balance), BigInt(0));
      
      return {
        segment: name as "whale" | "active" | "regular" | "casual",
        count,
        volumeShare: Number(volume * BigInt(100) / totalVolume) / 100,
        activityShare: count / totalHolders
      };
    });
  }

  private calculateGrowthRate(data: any[], metric: string): number {
    if (!data || data.length < 2) return 0;

    const recent = data[data.length - 1][metric];
    const old = data[0][metric];

    return old === 0 ? 0 : (recent - old) / old;
  }

  private calculateVolumeGrowthRate(data: any[]): number {
    if (!data || data.length < 2) return 0;

    const recent = BigInt(data[data.length - 1].volume);
    const old = BigInt(data[0].volume);

    return old === BigInt(0) ? 0 : Number((recent - old) * BigInt(100) / old) / 100;
  }

  private analyzeSeasonality(data: any[]): {
    daily: number;
    weekly: number;
    monthly: number;
  } {
    // TODO: 实现周期性分析
    return {
      daily: 0,
      weekly: 0,
      monthly: 0
    };
  }

  private calculateConsistency(data: any[]): number {
    if (!data || data.length < 2) return 0;

    // 计算活动水平的变异系数
    const transactions = data.map(d => d.transactions);
    const mean = transactions.reduce((sum, t) => sum + t, 0) / transactions.length;
    const variance = transactions.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / transactions.length;
    const stdDev = Math.sqrt(variance);

    // 变异系数越小，一致性越高
    const cv = mean === 0 ? 0 : stdDev / mean;
    return Math.max(0, 1 - cv);
  }

  private calculateVolatility(data: any[]): number {
    if (!data || data.length < 2) return 0;

    // 计算日度变化率的标准差
    const returns = [];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1].transactions;
      const curr = data[i].transactions;
      if (prev !== 0) {
        returns.push((curr - prev) / prev);
      }
    }

    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  private analyzeActivityLevel(
    current: ActivityAnalysisOutput["current"],
    historical?: ActivityAnalysisOutput["historical"]
  ): ActivityAnalysisOutput["analysis"]["activity"] {
    const factors: ActivityAnalysisOutput["analysis"]["activity"]["factors"] = [];
    let score = 0;

    // 评估交易活跃度
    const dailyTransactions = current.metrics.transactions.count24h;
    if (dailyTransactions > 1000) {
      factors.push({
        name: "transaction_volume",
        impact: "POSITIVE",
        description: "High daily transaction count indicates strong activity"
      });
      score += 2;
    } else if (dailyTransactions < 100) {
      factors.push({
        name: "transaction_volume",
        impact: "NEGATIVE",
        description: "Low daily transaction count suggests limited activity"
      });
      score -= 2;
    }

    // 评估用户活跃度
    const activeUsers = current.metrics.users.active24h;
    if (activeUsers > 100) {
      factors.push({
        name: "active_users",
        impact: "POSITIVE",
        description: "Strong daily active user base"
      });
      score += 2;
    } else if (activeUsers < 10) {
      factors.push({
        name: "active_users",
        impact: "NEGATIVE",
        description: "Very few active users"
      });
      score -= 2;
    }

    // 评估流通速度
    const velocity = current.metrics.velocity.daily;
    if (velocity > 0.1) {
      factors.push({
        name: "token_velocity",
        impact: "POSITIVE",
        description: "Healthy token circulation velocity"
      });
      score += 1;
    } else if (velocity < 0.01) {
      factors.push({
        name: "token_velocity",
        impact: "NEGATIVE",
        description: "Very low token circulation"
      });
      score -= 1;
    }

    // 评估历史趋势
    if (historical) {
      const growth = historical.trends.activity;
      if (growth.transactionGrowth > 0.2 && growth.userGrowth > 0.1) {
        factors.push({
          name: "growth_trend",
          impact: "POSITIVE",
          description: "Strong growth in both transactions and users"
        });
        score += 1;
      } else if (growth.transactionGrowth < -0.2 && growth.userGrowth < -0.1) {
        factors.push({
          name: "growth_trend",
          impact: "NEGATIVE",
          description: "Declining activity across metrics"
        });
        score -= 1;
      }
    }

    // 确定活动水平
    let level: ActivityAnalysisOutput["analysis"]["activity"]["level"];
    if (score >= 3) level = "HIGH";
    else if (score <= -3) level = "LOW";
    else level = "MODERATE";

    return {
      level,
      score,
      factors
    };
  }

  private analyzeActivityPatterns(
    current: ActivityAnalysisOutput["current"],
    historical?: ActivityAnalysisOutput["historical"]
  ): ActivityAnalysisOutput["analysis"]["patterns"] {
    const characteristics: ActivityAnalysisOutput["analysis"]["patterns"]["characteristics"] = [];
    let score = 0;

    // 分析时间分布
    const hourlyDist = current.patterns.temporal.hourly;
    const activeHours = hourlyDist.filter(h => h.transactions > 0).length;
    if (activeHours > 18) {
      characteristics.push({
        name: "time_distribution",
        significance: "HIGH",
        description: "Well-distributed activity across the day"
      });
      score += 2;
    } else if (activeHours < 6) {
      characteristics.push({
        name: "time_distribution",
        significance: "LOW",
        description: "Highly concentrated activity periods"
      });
      score -= 2;
    }

    // 分析用户行为
    const whales = current.patterns.behavioral.userSegments.find(s => s.segment === "whale");
    if (whales && whales.volumeShare > 0.8) {
      characteristics.push({
        name: "user_behavior",
        significance: "HIGH",
        description: "Dominated by whale activity"
      });
      score -= 1;
    }

    // 分析历史模式
    if (historical) {
      const { consistency, volatility } = historical.trends.patterns;
      if (consistency > 0.7) {
        characteristics.push({
          name: "consistency",
          significance: "HIGH",
          description: "Highly consistent activity patterns"
        });
        score += 1;
      } else if (consistency < 0.3) {
        characteristics.push({
          name: "consistency",
          significance: "LOW",
          description: "Irregular activity patterns"
        });
        score -= 1;
      }

      if (volatility > 0.5) {
        characteristics.push({
          name: "volatility",
          significance: "HIGH",
          description: "High activity volatility"
        });
        score -= 1;
      }
    }

    // 确定模式类型
    let type: ActivityAnalysisOutput["analysis"]["patterns"]["type"];
    if (score >= 2) type = "HEALTHY";
    else if (score <= -2) type = "CONCERNING";
    else type = "NEUTRAL";

    return {
      type,
      characteristics
    };
  }

  private analyzeUserBehavior(
    current: ActivityAnalysisOutput["current"],
    historical?: ActivityAnalysisOutput["historical"]
  ): ActivityAnalysisOutput["analysis"]["users"] {
    const insights: string[] = [];
    let diversity: ActivityAnalysisOutput["analysis"]["users"]["diversity"] = "MODERATE";
    let engagement: ActivityAnalysisOutput["analysis"]["users"]["engagement"] = "MODERATE";
    let loyalty: ActivityAnalysisOutput["analysis"]["users"]["loyalty"] = "MODERATE";

    // 分析用户多样性
    const segments = current.patterns.behavioral.userSegments;
    const whaleShare = segments.find(s => s.segment === "whale")?.volumeShare || 0;
    const regularShare = segments.find(s => s.segment === "regular")?.volumeShare || 0;

    if (whaleShare < 0.4 && regularShare > 0.3) {
      diversity = "HIGH";
      insights.push("Well-balanced distribution of user segments");
    } else if (whaleShare > 0.7) {
      diversity = "LOW";
      insights.push("High concentration in whale segment");
    }

    // 分析用户参与度
    const activeRatio = current.metrics.users.active24h / 
      (segments.reduce((sum, s) => sum + s.count, 0));

    if (activeRatio > 0.3) {
      engagement = "STRONG";
      insights.push("Strong daily user engagement");
    } else if (activeRatio < 0.1) {
      engagement = "WEAK";
      insights.push("Low user engagement levels");
    }

    // 分析用户忠诚度
    const retentionRate = current.metrics.users.retentionRate;
    if (retentionRate > 0.7) {
      loyalty = "HIGH";
      insights.push("High user retention rate");
    } else if (retentionRate < 0.3) {
      loyalty = "LOW";
      insights.push("Low user retention rate");
    }

    // 添加历史趋势洞察
    if (historical) {
      const { userGrowth } = historical.trends.activity;
      if (userGrowth > 0.2) {
        insights.push("Strong user base growth trend");
      } else if (userGrowth < -0.2) {
        insights.push("Declining user base trend");
      }
    }

    return {
      diversity,
      engagement,
      loyalty,
      insights
    };
  }

  private generateRecommendations(
    activity: ActivityAnalysisOutput["analysis"]["activity"],
    patterns: ActivityAnalysisOutput["analysis"]["patterns"],
    users: ActivityAnalysisOutput["analysis"]["users"],
    historical?: ActivityAnalysisOutput["historical"]
  ): ActivityAnalysisOutput["analysis"]["recommendations"] {
    const recommendations: ActivityAnalysisOutput["analysis"]["recommendations"] = [];

    // 基于活动水平的建议
    if (activity.level === "LOW") {
      recommendations.push({
        priority: "HIGH",
        action: "Implement activity incentive program",
        rationale: "Current activity levels are significantly below optimal",
        expectedImpact: "Increase in daily transactions and active users"
      });
    }

    // 基于活动模式的建议
    if (patterns.type === "CONCERNING") {
      const volatilityCharacteristic = patterns.characteristics.find(
        c => c.name === "volatility" && c.significance === "HIGH"
      );
      if (volatilityCharacteristic) {
        recommendations.push({
          priority: "MEDIUM",
          action: "Develop market making program",
          rationale: "High activity volatility indicates potential liquidity issues",
          expectedImpact: "Improved activity stability and reduced volatility"
        });
      }
    }

    // 基于用户行为的建议
    if (users.diversity === "LOW") {
      recommendations.push({
        priority: "HIGH",
        action: "Launch user acquisition campaign",
        rationale: "Current user base is highly concentrated",
        expectedImpact: "Increased user diversity and reduced concentration risk"
      });
    }

    if (users.engagement === "WEAK") {
      recommendations.push({
        priority: "MEDIUM",
        action: "Develop user engagement program",
        rationale: "Low user engagement levels",
        expectedImpact: "Improved user activity and retention"
      });
    }

    // 基于历史趋势的建议
    if (historical && historical.trends.activity.userGrowth < -0.1) {
      recommendations.push({
        priority: "HIGH",
        action: "Implement user retention strategy",
        rationale: "Declining user growth trend",
        expectedImpact: "Stabilized user base and improved growth"
      });
    }

    return recommendations;
  }
} 