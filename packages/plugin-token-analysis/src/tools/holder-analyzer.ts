import { Tool } from "langchain/tools";
import { logger } from "@lumix/core";
import { ChainType } from "../types";

export interface HolderInfo {
  address: string;
  balance: string;
  percentage: number;
  lastTransfer: number;
  transferCount: number;
  isContract: boolean;
}

export interface HolderDistribution {
  ranges: {
    range: string;
    count: number;
    totalBalance: string;
    percentage: number;
  }[];
  topHolders: HolderInfo[];
  statistics: {
    totalHolders: number;
    activeHolders: number;
    averageBalance: string;
    medianBalance: string;
    giniCoefficient: number;
  };
}

export interface HolderActivityMetrics {
  dailyActiveHolders: number;
  weeklyActiveHolders: number;
  monthlyActiveHolders: number;
  retentionRate: number;
  churnRate: number;
  averageHoldingPeriod: number;
}

export interface HolderAnalyzerConfig {
  topHoldersLimit: number;
  activityThreshold: number;
  updateInterval: number;
  distributionRanges: {
    min: string;
    max: string;
  }[];
}

export class HolderAnalyzerTool extends Tool {
  name = "holder_analyzer";
  description = "Analyzes token holder distribution and behavior patterns";
  
  private config: HolderAnalyzerConfig;
  private cache: Map<string, {
    distribution: HolderDistribution;
    activity: HolderActivityMetrics;
    timestamp: number;
  }>;

  constructor(config: Partial<HolderAnalyzerConfig> = {}) {
    super();
    this.config = {
      topHoldersLimit: 100,
      activityThreshold: 30 * 24 * 60 * 60 * 1000, // 30天
      updateInterval: 3600000, // 1小时
      distributionRanges: [
        { min: "0", max: "100" },
        { min: "100", max: "1000" },
        { min: "1000", max: "10000" },
        { min: "10000", max: "100000" },
        { min: "100000", max: "1000000" },
        { min: "1000000", max: "∞" }
      ],
      ...config
    };
    this.cache = new Map();
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "analyze-distribution":
          const distribution = await this.analyzeDistribution(params.token);
          return JSON.stringify(distribution, null, 2);
        
        case "get-activity-metrics":
          const activity = await this.getActivityMetrics(params.token);
          return JSON.stringify(activity, null, 2);
        
        case "get-top-holders":
          const topHolders = await this.getTopHolders(params.token);
          return JSON.stringify(topHolders, null, 2);
        
        case "calculate-concentration":
          const concentration = await this.calculateConcentration(params.token);
          return JSON.stringify(concentration, null, 2);
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Holder Analyzer Tool", error.message);
      }
      throw error;
    }
  }

  private async analyzeDistribution(token: { address: string; chain: ChainType }): Promise<HolderDistribution> {
    // 检查缓存
    const cacheKey = `${token.chain}:${token.address}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.updateInterval) {
      return cached.distribution;
    }

    try {
      // 获取所有持有者
      const holders = await this.getHolders(token);
      
      // 计算分布范围
      const ranges = this.calculateDistributionRanges(holders);
      
      // 获取前N大持有者
      const topHolders = this.getTopHoldersList(holders);
      
      // 计算统计数据
      const statistics = this.calculateStatistics(holders);

      const distribution: HolderDistribution = {
        ranges,
        topHolders,
        statistics
      };

      // 更新缓存
      this.cache.set(cacheKey, {
        distribution,
        activity: await this.getActivityMetrics(token),
        timestamp: Date.now()
      });

      return distribution;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Holder Analyzer Tool",
          `Failed to analyze distribution for token ${token.address} on ${token.chain}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getActivityMetrics(token: { address: string; chain: ChainType }): Promise<HolderActivityMetrics> {
    try {
      // TODO: 实现获取活动指标的逻辑
      return {
        dailyActiveHolders: 0,
        weeklyActiveHolders: 0,
        monthlyActiveHolders: 0,
        retentionRate: 0,
        churnRate: 0,
        averageHoldingPeriod: 0
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Holder Analyzer Tool",
          `Failed to get activity metrics for token ${token.address} on ${token.chain}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getTopHolders(token: { address: string; chain: ChainType }): Promise<HolderInfo[]> {
    try {
      const distribution = await this.analyzeDistribution(token);
      return distribution.topHolders;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Holder Analyzer Tool",
          `Failed to get top holders for token ${token.address} on ${token.chain}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async calculateConcentration(token: { address: string; chain: ChainType }): Promise<number> {
    try {
      const distribution = await this.analyzeDistribution(token);
      return this.calculateGiniCoefficient(distribution.topHolders);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Holder Analyzer Tool",
          `Failed to calculate concentration for token ${token.address} on ${token.chain}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getHolders(token: { address: string; chain: ChainType }): Promise<HolderInfo[]> {
    // TODO: 实现从链上获取持有者信息的逻辑
    return [];
  }

  private calculateDistributionRanges(holders: HolderInfo[]): HolderDistribution["ranges"] {
    const ranges: HolderDistribution["ranges"] = [];
    
    for (const range of this.config.distributionRanges) {
      const holdersInRange = holders.filter(h => {
        const balance = BigInt(h.balance);
        const min = BigInt(range.min);
        const max = range.max === "∞" ? BigInt(2) ** BigInt(256) - BigInt(1) : BigInt(range.max);
        return balance >= min && balance <= max;
      });

      const totalBalance = holdersInRange.reduce(
        (sum, h) => sum + BigInt(h.balance),
        BigInt(0)
      ).toString();

      ranges.push({
        range: `${range.min}-${range.max}`,
        count: holdersInRange.length,
        totalBalance,
        percentage: holdersInRange.length / holders.length
      });
    }

    return ranges;
  }

  private getTopHoldersList(holders: HolderInfo[]): HolderInfo[] {
    return holders
      .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))
      .slice(0, this.config.topHoldersLimit);
  }

  private calculateStatistics(holders: HolderInfo[]): HolderDistribution["statistics"] {
    const balances = holders.map(h => BigInt(h.balance));
    const total = balances.reduce((sum, b) => sum + b, BigInt(0));
    const activeHolders = holders.filter(h => 
      Date.now() - h.lastTransfer < this.config.activityThreshold
    ).length;

    return {
      totalHolders: holders.length,
      activeHolders,
      averageBalance: (total / BigInt(holders.length)).toString(),
      medianBalance: this.calculateMedian(balances).toString(),
      giniCoefficient: this.calculateGiniCoefficient(holders)
    };
  }

  private calculateMedian(balances: bigint[]): bigint {
    const sorted = [...balances].sort((a, b) => Number(a - b));
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / BigInt(2);
    }
    return sorted[mid];
  }

  private calculateGiniCoefficient(holders: HolderInfo[]): number {
    if (holders.length < 2) return 0;

    const balances = holders.map(h => Number(BigInt(h.balance)));
    const n = balances.length;
    const mean = balances.reduce((sum, b) => sum + b, 0) / n;
    
    let sumAbsoluteDifferences = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumAbsoluteDifferences += Math.abs(balances[i] - balances[j]);
      }
    }

    return sumAbsoluteDifferences / (2 * n * n * mean);
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public updateConfig(config: Partial<HolderAnalyzerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 