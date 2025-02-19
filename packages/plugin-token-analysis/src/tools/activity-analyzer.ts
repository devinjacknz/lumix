import { Tool } from "langchain/tools";
import { logger } from "@lumix/core";
import { ChainType } from "../types";

export interface TransferEvent {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  blockNumber: number;
}

export interface ActivityMetrics {
  volume24h: string;
  transactions24h: number;
  uniqueSenders24h: number;
  uniqueReceivers24h: number;
  averageTransferValue: string;
  largestTransfer: string;
  velocity: number;
}

export interface ActivityPattern {
  hourlyDistribution: {
    hour: number;
    count: number;
    volume: string;
  }[];
  weeklyDistribution: {
    day: number;
    count: number;
    volume: string;
  }[];
  transferSizeDistribution: {
    range: string;
    count: number;
    totalVolume: string;
  }[];
}

export interface ActivityTrend {
  dailyMetrics: {
    date: string;
    volume: string;
    transactions: number;
    uniqueAddresses: number;
    velocity: number;
  }[];
  weeklyGrowth: {
    volume: number;
    transactions: number;
    uniqueAddresses: number;
  };
  monthlyGrowth: {
    volume: number;
    transactions: number;
    uniqueAddresses: number;
  };
}

export interface ActivityAnalyzerConfig {
  updateInterval: number;
  maxTransferHistory: number;
  volumeRanges: {
    min: string;
    max: string;
  }[];
  trendPeriod: number;
}

export class ActivityAnalyzerTool extends Tool {
  name = "activity_analyzer";
  description = "Analyzes token transfer activity and transaction patterns";
  
  private config: ActivityAnalyzerConfig;
  private cache: Map<string, {
    metrics: ActivityMetrics;
    pattern: ActivityPattern;
    trend: ActivityTrend;
    timestamp: number;
  }>;

  constructor(config: Partial<ActivityAnalyzerConfig> = {}) {
    super();
    this.config = {
      updateInterval: 300000, // 5分钟
      maxTransferHistory: 10000,
      volumeRanges: [
        { min: "0", max: "100" },
        { min: "100", max: "1000" },
        { min: "1000", max: "10000" },
        { min: "10000", max: "100000" },
        { min: "100000", max: "1000000" },
        { min: "1000000", max: "∞" }
      ],
      trendPeriod: 30, // 30天
      ...config
    };
    this.cache = new Map();
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "get-metrics":
          const metrics = await this.getActivityMetrics(params.token);
          return JSON.stringify(metrics, null, 2);
        
        case "analyze-pattern":
          const pattern = await this.analyzePattern(params.token);
          return JSON.stringify(pattern, null, 2);
        
        case "analyze-trend":
          const trend = await this.analyzeTrend(params.token);
          return JSON.stringify(trend, null, 2);
        
        case "get-transfers":
          const transfers = await this.getTransfers(params.token, params.options);
          return JSON.stringify(transfers, null, 2);
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Activity Analyzer Tool", error.message);
      }
      throw error;
    }
  }

  private async getActivityMetrics(token: { address: string; chain: ChainType }): Promise<ActivityMetrics> {
    // 检查缓存
    const cacheKey = `${token.chain}:${token.address}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.updateInterval) {
      return cached.metrics;
    }

    try {
      // 获取最近24小时的转账记录
      const transfers = await this.getTransfers(token, {
        startTime: Date.now() - 24 * 60 * 60 * 1000,
        endTime: Date.now()
      });

      // 计算指标
      const volume = transfers.reduce(
        (sum, t) => sum + BigInt(t.value),
        BigInt(0)
      ).toString();

      const uniqueSenders = new Set(transfers.map(t => t.from)).size;
      const uniqueReceivers = new Set(transfers.map(t => t.to)).size;

      const avgValue = transfers.length > 0
        ? (BigInt(volume) / BigInt(transfers.length)).toString()
        : "0";

      const largestTransfer = transfers.reduce(
        (max, t) => BigInt(t.value) > BigInt(max) ? t.value : max,
        "0"
      );

      const metrics: ActivityMetrics = {
        volume24h: volume,
        transactions24h: transfers.length,
        uniqueSenders24h: uniqueSenders,
        uniqueReceivers24h: uniqueReceivers,
        averageTransferValue: avgValue,
        largestTransfer,
        velocity: this.calculateVelocity(transfers)
      };

      // 更新缓存
      if (!cached) {
        this.cache.set(cacheKey, {
          metrics,
          pattern: await this.analyzePattern(token),
          trend: await this.analyzeTrend(token),
          timestamp: Date.now()
        });
      } else {
        cached.metrics = metrics;
        cached.timestamp = Date.now();
      }

      return metrics;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Activity Analyzer Tool",
          `Failed to get activity metrics for token ${token.address} on ${token.chain}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async analyzePattern(token: { address: string; chain: ChainType }): Promise<ActivityPattern> {
    try {
      // 获取最近的转账记录
      const transfers = await this.getTransfers(token, {
        limit: this.config.maxTransferHistory
      });

      // 计算小时分布
      const hourlyDist = this.calculateHourlyDistribution(transfers);

      // 计算周分布
      const weeklyDist = this.calculateWeeklyDistribution(transfers);

      // 计算转账规模分布
      const sizeDist = this.calculateTransferSizeDistribution(transfers);

      return {
        hourlyDistribution: hourlyDist,
        weeklyDistribution: weeklyDist,
        transferSizeDistribution: sizeDist
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Activity Analyzer Tool",
          `Failed to analyze pattern for token ${token.address} on ${token.chain}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async analyzeTrend(token: { address: string; chain: ChainType }): Promise<ActivityTrend> {
    try {
      // 获取趋势周期内的转账记录
      const startTime = Date.now() - this.config.trendPeriod * 24 * 60 * 60 * 1000;
      const transfers = await this.getTransfers(token, { startTime });

      // 计算每日指标
      const dailyMetrics = this.calculateDailyMetrics(transfers);

      // 计算增长率
      const weeklyGrowth = this.calculateGrowthRate(dailyMetrics, 7);
      const monthlyGrowth = this.calculateGrowthRate(dailyMetrics, 30);

      return {
        dailyMetrics,
        weeklyGrowth,
        monthlyGrowth
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Activity Analyzer Tool",
          `Failed to analyze trend for token ${token.address} on ${token.chain}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getTransfers(
    token: { address: string; chain: ChainType },
    options?: {
      startTime?: number;
      endTime?: number;
      limit?: number;
    }
  ): Promise<TransferEvent[]> {
    // TODO: 实现从链上获取转账记录的逻辑
    return [];
  }

  private calculateVelocity(transfers: TransferEvent[]): number {
    if (transfers.length === 0) return 0;

    const totalVolume = transfers.reduce(
      (sum, t) => sum + BigInt(t.value),
      BigInt(0)
    );
    
    const timeRange = transfers[transfers.length - 1].timestamp - transfers[0].timestamp;
    if (timeRange === 0) return 0;

    // 计算每秒的平均转账量
    return Number(totalVolume) / (timeRange / 1000);
  }

  private calculateHourlyDistribution(transfers: TransferEvent[]): ActivityPattern["hourlyDistribution"] {
    const hourly = new Array(24).fill(null).map((_, hour) => ({
      hour,
      count: 0,
      volume: "0"
    }));

    transfers.forEach(transfer => {
      const hour = new Date(transfer.timestamp).getHours();
      hourly[hour].count++;
      hourly[hour].volume = (BigInt(hourly[hour].volume) + BigInt(transfer.value)).toString();
    });

    return hourly;
  }

  private calculateWeeklyDistribution(transfers: TransferEvent[]): ActivityPattern["weeklyDistribution"] {
    const weekly = new Array(7).fill(null).map((_, day) => ({
      day,
      count: 0,
      volume: "0"
    }));

    transfers.forEach(transfer => {
      const day = new Date(transfer.timestamp).getDay();
      weekly[day].count++;
      weekly[day].volume = (BigInt(weekly[day].volume) + BigInt(transfer.value)).toString();
    });

    return weekly;
  }

  private calculateTransferSizeDistribution(transfers: TransferEvent[]): ActivityPattern["transferSizeDistribution"] {
    const distribution = this.config.volumeRanges.map(range => ({
      range: `${range.min}-${range.max}`,
      count: 0,
      totalVolume: "0"
    }));

    transfers.forEach(transfer => {
      const value = BigInt(transfer.value);
      const rangeIndex = this.config.volumeRanges.findIndex(range => {
        const min = BigInt(range.min);
        const max = range.max === "∞" ? BigInt(2) ** BigInt(256) - BigInt(1) : BigInt(range.max);
        return value >= min && value <= max;
      });

      if (rangeIndex >= 0) {
        distribution[rangeIndex].count++;
        distribution[rangeIndex].totalVolume = (
          BigInt(distribution[rangeIndex].totalVolume) + value
        ).toString();
      }
    });

    return distribution;
  }

  private calculateDailyMetrics(transfers: TransferEvent[]): ActivityTrend["dailyMetrics"] {
    const dailyData = new Map<string, {
      volume: bigint;
      transactions: number;
      addresses: Set<string>;
    }>();

    transfers.forEach(transfer => {
      const date = new Date(transfer.timestamp).toISOString().split("T")[0];
      const dayData = dailyData.get(date) || {
        volume: BigInt(0),
        transactions: 0,
        addresses: new Set<string>()
      };

      dayData.volume += BigInt(transfer.value);
      dayData.transactions++;
      dayData.addresses.add(transfer.from);
      dayData.addresses.add(transfer.to);

      dailyData.set(date, dayData);
    });

    return Array.from(dailyData.entries()).map(([date, data]) => ({
      date,
      volume: data.volume.toString(),
      transactions: data.transactions,
      uniqueAddresses: data.addresses.size,
      velocity: Number(data.volume) / (24 * 60 * 60) // 每秒平均转账量
    }));
  }

  private calculateGrowthRate(
    metrics: ActivityTrend["dailyMetrics"],
    days: number
  ): ActivityTrend["weeklyGrowth"] {
    if (metrics.length < days * 2) {
      return {
        volume: 0,
        transactions: 0,
        uniqueAddresses: 0
      };
    }

    const recent = metrics.slice(-days);
    const previous = metrics.slice(-days * 2, -days);

    const recentSum = {
      volume: recent.reduce((sum, m) => sum + BigInt(m.volume), BigInt(0)),
      transactions: recent.reduce((sum, m) => sum + m.transactions, 0),
      uniqueAddresses: recent.reduce((sum, m) => sum + m.uniqueAddresses, 0)
    };

    const previousSum = {
      volume: previous.reduce((sum, m) => sum + BigInt(m.volume), BigInt(0)),
      transactions: previous.reduce((sum, m) => sum + m.transactions, 0),
      uniqueAddresses: previous.reduce((sum, m) => sum + m.uniqueAddresses, 0)
    };

    return {
      volume: previousSum.volume === BigInt(0) ? 0 : Number(recentSum.volume - previousSum.volume) / Number(previousSum.volume),
      transactions: previousSum.transactions === 0 ? 0 : (recentSum.transactions - previousSum.transactions) / previousSum.transactions,
      uniqueAddresses: previousSum.uniqueAddresses === 0 ? 0 : (recentSum.uniqueAddresses - previousSum.uniqueAddresses) / previousSum.uniqueAddresses
    };
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public updateConfig(config: Partial<ActivityAnalyzerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 