import { logger } from "@lumix/core";

export interface ActivityEvent {
  type: "transfer" | "swap" | "liquidity" | "other";
  from: string;
  to: string;
  value: string;
  timestamp: number;
  hash: string;
  metadata?: Record<string, any>;
}

export interface ActivityMetrics {
  volume: {
    total: string;
    average: string;
    median: string;
    byType: Record<string, string>;
  };
  transactions: {
    total: number;
    byType: Record<string, number>;
    uniqueUsers: number;
    activeUsers: {
      daily: number;
      weekly: number;
      monthly: number;
    };
  };
  patterns: {
    hourly: {
      hour: number;
      transactions: number;
      volume: string;
      uniqueUsers: number;
    }[];
    daily: {
      date: string;
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
  users: {
    new: number;
    returning: number;
    churn: number;
    retention: {
      daily: number;
      weekly: number;
      monthly: number;
    };
    segments: {
      segment: "high" | "medium" | "low";
      users: number;
      volume: string;
      transactions: number;
    }[];
  };
  velocity: {
    current: number;
    trend: number;
    byPeriod: {
      hourly: number[];
      daily: number[];
      weekly: number[];
    };
  };
}

export interface ActivityAnalysisConfig {
  timeframes: {
    hourly: number;
    daily: number;
    weekly: number;
    monthly: number;
  };
  thresholds: {
    activity: {
      high: number;
      medium: number;
    };
    velocity: {
      high: number;
      medium: number;
    };
  };
  segmentation: {
    volume: {
      high: string;
      medium: string;
    };
    frequency: {
      high: number;
      medium: number;
    };
  };
  sampling: {
    enabled: boolean;
    maxEvents: number;
    method: "random" | "stratified" | "systematic";
  };
  caching: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
}

export class ActivityAnalyzer {
  private static instance: ActivityAnalyzer;
  private config: ActivityAnalysisConfig;
  private cache: Map<string, {
    metrics: ActivityMetrics;
    timestamp: number;
  }>;

  private constructor(config: Partial<ActivityAnalysisConfig> = {}) {
    this.config = {
      timeframes: {
        hourly: 60 * 60 * 1000, // 1小时
        daily: 24 * 60 * 60 * 1000, // 1天
        weekly: 7 * 24 * 60 * 60 * 1000, // 1周
        monthly: 30 * 24 * 60 * 60 * 1000 // 1月
      },
      thresholds: {
        activity: {
          high: 100,
          medium: 10
        },
        velocity: {
          high: 0.1,
          medium: 0.01
        }
      },
      segmentation: {
        volume: {
          high: "10000",
          medium: "1000"
        },
        frequency: {
          high: 10,
          medium: 5
        }
      },
      sampling: {
        enabled: true,
        maxEvents: 10000,
        method: "stratified"
      },
      caching: {
        enabled: true,
        ttl: 300000, // 5分钟
        maxSize: 1000
      },
      ...config
    };
    this.cache = new Map();
  }

  public static getInstance(config?: Partial<ActivityAnalysisConfig>): ActivityAnalyzer {
    if (!ActivityAnalyzer.instance) {
      ActivityAnalyzer.instance = new ActivityAnalyzer(config);
    }
    return ActivityAnalyzer.instance;
  }

  public analyze(events: ActivityEvent[]): ActivityMetrics {
    try {
      // 数据预处理
      const processedEvents = this.preprocessEvents(events);

      // 计算基本指标
      const volume = this.calculateVolumeMetrics(processedEvents);
      const transactions = this.calculateTransactionMetrics(processedEvents);
      const patterns = this.analyzePatterns(processedEvents);
      const users = this.analyzeUsers(processedEvents);
      const velocity = this.calculateVelocity(processedEvents);

      return {
        volume,
        transactions,
        patterns,
        users,
        velocity
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Activity Analyzer", `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private preprocessEvents(events: ActivityEvent[]): ActivityEvent[] {
    // 排序
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    // 采样
    if (this.config.sampling.enabled && events.length > this.config.sampling.maxEvents) {
      return this.sampleEvents(sortedEvents);
    }

    return sortedEvents;
  }

  private sampleEvents(events: ActivityEvent[]): ActivityEvent[] {
    const { maxEvents, method } = this.config.sampling;

    switch (method) {
      case "random":
        return this.randomSample(events, maxEvents);
      case "stratified":
        return this.stratifiedSample(events, maxEvents);
      case "systematic":
        return this.systematicSample(events, maxEvents);
      default:
        return this.stratifiedSample(events, maxEvents);
    }
  }

  private randomSample(events: ActivityEvent[], size: number): ActivityEvent[] {
    const shuffled = [...events];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, size);
  }

  private stratifiedSample(events: ActivityEvent[], size: number): ActivityEvent[] {
    // 按类型分层
    const typeGroups = new Map<string, ActivityEvent[]>();
    events.forEach(event => {
      const group = typeGroups.get(event.type) || [];
      group.push(event);
      typeGroups.set(event.type, group);
    });

    // 从每层采样
    const result: ActivityEvent[] = [];
    const groupSize = Math.floor(size / typeGroups.size);

    typeGroups.forEach(group => {
      result.push(...this.randomSample(group, groupSize));
    });

    // 补充剩余配额
    const remaining = size - result.length;
    if (remaining > 0) {
      const allEvents = Array.from(typeGroups.values()).flat();
      result.push(...this.randomSample(allEvents, remaining));
    }

    return result.sort((a, b) => a.timestamp - b.timestamp);
  }

  private systematicSample(events: ActivityEvent[], size: number): ActivityEvent[] {
    const interval = events.length / size;
    const result: ActivityEvent[] = [];

    for (let i = 0; i < size; i++) {
      const index = Math.min(Math.floor(i * interval), events.length - 1);
      result.push(events[index]);
    }

    return result;
  }

  private calculateVolumeMetrics(events: ActivityEvent[]): ActivityMetrics["volume"] {
    // 计算总量
    const total = events.reduce(
      (sum, event) => sum + BigInt(event.value),
      BigInt(0)
    ).toString();

    // 计算平均值
    const average = events.length === 0 ? "0" :
      (BigInt(total) / BigInt(events.length)).toString();

    // 计算中位数
    const sorted = [...events].sort((a, b) => 
      Number(BigInt(a.value) - BigInt(b.value))
    );
    const median = events.length === 0 ? "0" :
      sorted[Math.floor(events.length / 2)].value;

    // 按类型统计
    const byType = events.reduce((acc, event) => {
      const current = BigInt(acc[event.type] || "0");
      acc[event.type] = (current + BigInt(event.value)).toString();
      return acc;
    }, {} as Record<string, string>);

    return {
      total,
      average,
      median,
      byType
    };
  }

  private calculateTransactionMetrics(events: ActivityEvent[]): ActivityMetrics["transactions"] {
    const now = Date.now();
    const uniqueUsers = new Set([
      ...events.map(e => e.from),
      ...events.map(e => e.to)
    ]).size;

    // 按类型统计
    const byType = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 计算活跃用户
    const activeUsers = {
      daily: this.countActiveUsers(events, now - this.config.timeframes.daily),
      weekly: this.countActiveUsers(events, now - this.config.timeframes.weekly),
      monthly: this.countActiveUsers(events, now - this.config.timeframes.monthly)
    };

    return {
      total: events.length,
      byType,
      uniqueUsers,
      activeUsers
    };
  }

  private countActiveUsers(events: ActivityEvent[], since: number): number {
    const activeUsers = new Set([
      ...events
        .filter(e => e.timestamp >= since)
        .flatMap(e => [e.from, e.to])
    ]);
    return activeUsers.size;
  }

  private analyzePatterns(events: ActivityEvent[]): ActivityMetrics["patterns"] {
    return {
      hourly: this.calculateHourlyPatterns(events),
      daily: this.calculateDailyPatterns(events),
      weekly: this.calculateWeeklyPatterns(events)
    };
  }

  private calculateHourlyPatterns(events: ActivityEvent[]): ActivityMetrics["patterns"]["hourly"] {
    const hourlyStats = new Array(24).fill(null).map((_, hour) => ({
      hour,
      transactions: 0,
      volume: "0",
      uniqueUsers: 0
    }));

    events.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      const stats = hourlyStats[hour];
      stats.transactions++;
      stats.volume = (BigInt(stats.volume) + BigInt(event.value)).toString();
      
      const users = new Set([event.from, event.to]);
      stats.uniqueUsers = users.size;
    });

    return hourlyStats;
  }

  private calculateDailyPatterns(events: ActivityEvent[]): ActivityMetrics["patterns"]["daily"] {
    const dailyMap = new Map<string, {
      transactions: number;
      volume: bigint;
      users: Set<string>;
    }>();

    events.forEach(event => {
      const date = new Date(event.timestamp).toISOString().split("T")[0];
      const stats = dailyMap.get(date) || {
        transactions: 0,
        volume: BigInt(0),
        users: new Set<string>()
      };

      stats.transactions++;
      stats.volume += BigInt(event.value);
      stats.users.add(event.from);
      stats.users.add(event.to);

      dailyMap.set(date, stats);
    });

    return Array.from(dailyMap.entries()).map(([date, stats]) => ({
      date,
      transactions: stats.transactions,
      volume: stats.volume.toString(),
      uniqueUsers: stats.users.size
    }));
  }

  private calculateWeeklyPatterns(events: ActivityEvent[]): ActivityMetrics["patterns"]["weekly"] {
    const weeklyMap = new Map<string, {
      transactions: number;
      volume: bigint;
      users: Set<string>;
    }>();

    events.forEach(event => {
      const date = new Date(event.timestamp);
      const week = this.getWeekNumber(date);
      const stats = weeklyMap.get(week) || {
        transactions: 0,
        volume: BigInt(0),
        users: new Set<string>()
      };

      stats.transactions++;
      stats.volume += BigInt(event.value);
      stats.users.add(event.from);
      stats.users.add(event.to);

      weeklyMap.set(week, stats);
    });

    return Array.from(weeklyMap.entries()).map(([week, stats]) => ({
      week,
      transactions: stats.transactions,
      volume: stats.volume.toString(),
      uniqueUsers: stats.users.size
    }));
  }

  private getWeekNumber(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${weekNo.toString().padStart(2, "0")}`;
  }

  private analyzeUsers(events: ActivityEvent[]): ActivityMetrics["users"] {
    const now = Date.now();
    const userStats = new Map<string, {
      firstSeen: number;
      lastSeen: number;
      transactions: number;
      volume: bigint;
    }>();

    // 收集用户统计
    events.forEach(event => {
      [event.from, event.to].forEach(address => {
        const stats = userStats.get(address) || {
          firstSeen: event.timestamp,
          lastSeen: event.timestamp,
          transactions: 0,
          volume: BigInt(0)
        };

        stats.transactions++;
        stats.volume += BigInt(event.value);
        stats.firstSeen = Math.min(stats.firstSeen, event.timestamp);
        stats.lastSeen = Math.max(stats.lastSeen, event.timestamp);

        userStats.set(address, stats);
      });
    });

    // 计算用户指标
    const newUsers = Array.from(userStats.values()).filter(
      stats => now - stats.firstSeen <= this.config.timeframes.daily
    ).length;

    const returningUsers = Array.from(userStats.values()).filter(stats => 
      stats.transactions > 1 &&
      now - stats.lastSeen <= this.config.timeframes.daily
    ).length;

    const churnedUsers = Array.from(userStats.values()).filter(stats =>
      now - stats.lastSeen > this.config.timeframes.monthly
    ).length;

    // 计算留存率
    const retention = {
      daily: this.calculateRetention(events, this.config.timeframes.daily),
      weekly: this.calculateRetention(events, this.config.timeframes.weekly),
      monthly: this.calculateRetention(events, this.config.timeframes.monthly)
    };

    // 用户分段
    const segments = this.segmentUsers(Array.from(userStats.entries()));

    return {
      new: newUsers,
      returning: returningUsers,
      churn: churnedUsers,
      retention,
      segments
    };
  }

  private calculateRetention(events: ActivityEvent[], period: number): number {
    const now = Date.now();
    const previousPeriod = new Set(
      events
        .filter(e => e.timestamp >= now - period * 2 && e.timestamp < now - period)
        .flatMap(e => [e.from, e.to])
    );

    const currentPeriod = new Set(
      events
        .filter(e => e.timestamp >= now - period)
        .flatMap(e => [e.from, e.to])
    );

    const retained = Array.from(previousPeriod).filter(user => 
      currentPeriod.has(user)
    ).length;

    return previousPeriod.size === 0 ? 0 : retained / previousPeriod.size;
  }

  private segmentUsers(
    users: [string, {
      firstSeen: number;
      lastSeen: number;
      transactions: number;
      volume: bigint;
    }][]
  ): ActivityMetrics["users"]["segments"] {
    const { volume: volumeThresholds, frequency: freqThresholds } = this.config.segmentation;

    const segments = {
      high: { users: 0, volume: BigInt(0), transactions: 0 },
      medium: { users: 0, volume: BigInt(0), transactions: 0 },
      low: { users: 0, volume: BigInt(0), transactions: 0 }
    };

    users.forEach(([_, stats]) => {
      let segment: "high" | "medium" | "low";

      if (
        stats.volume >= BigInt(volumeThresholds.high) ||
        stats.transactions >= freqThresholds.high
      ) {
        segment = "high";
      } else if (
        stats.volume >= BigInt(volumeThresholds.medium) ||
        stats.transactions >= freqThresholds.medium
      ) {
        segment = "medium";
      } else {
        segment = "low";
      }

      segments[segment].users++;
      segments[segment].volume += stats.volume;
      segments[segment].transactions += stats.transactions;
    });

    return Object.entries(segments).map(([segment, stats]) => ({
      segment: segment as "high" | "medium" | "low",
      users: stats.users,
      volume: stats.volume.toString(),
      transactions: stats.transactions
    }));
  }

  private calculateVelocity(events: ActivityEvent[]): ActivityMetrics["velocity"] {
    if (events.length === 0) {
      return {
        current: 0,
        trend: 0,
        byPeriod: {
          hourly: [],
          daily: [],
          weekly: []
        }
      };
    }

    // 计算当前速度
    const current = this.calculateCurrentVelocity(events);

    // 计算趋势
    const trend = this.calculateVelocityTrend(events);

    // 计算周期性速度
    const byPeriod = {
      hourly: this.calculatePeriodVelocity(events, this.config.timeframes.hourly),
      daily: this.calculatePeriodVelocity(events, this.config.timeframes.daily),
      weekly: this.calculatePeriodVelocity(events, this.config.timeframes.weekly)
    };

    return {
      current,
      trend,
      byPeriod
    };
  }

  private calculateCurrentVelocity(events: ActivityEvent[]): number {
    const window = events.slice(-100); // 使用最近100个事件
    if (window.length < 2) return 0;

    const volume = window.reduce(
      (sum, event) => sum + BigInt(event.value),
      BigInt(0)
    );
    const timeRange = window[window.length - 1].timestamp - window[0].timestamp;

    return timeRange === 0 ? 0 : Number(volume) / (timeRange / 1000); // 每秒
  }

  private calculateVelocityTrend(events: ActivityEvent[]): number {
    const recentEvents = events.slice(-200); // 使用最近200个事件
    if (recentEvents.length < 100) return 0;

    const mid = Math.floor(recentEvents.length / 2);
    const firstHalf = recentEvents.slice(0, mid);
    const secondHalf = recentEvents.slice(mid);

    const firstVelocity = this.calculateCurrentVelocity(firstHalf);
    const secondVelocity = this.calculateCurrentVelocity(secondHalf);

    return firstVelocity === 0 ? 0 : (secondVelocity - firstVelocity) / firstVelocity;
  }

  private calculatePeriodVelocity(events: ActivityEvent[], period: number): number[] {
    if (events.length === 0) return [];

    const velocities: number[] = [];
    const startTime = events[0].timestamp;
    const endTime = events[events.length - 1].timestamp;

    for (let time = startTime; time < endTime; time += period) {
      const periodEvents = events.filter(e =>
        e.timestamp >= time && e.timestamp < time + period
      );

      if (periodEvents.length > 0) {
        const volume = periodEvents.reduce(
          (sum, event) => sum + BigInt(event.value),
          BigInt(0)
        );
        velocities.push(Number(volume) / (period / 1000));
      } else {
        velocities.push(0);
      }
    }

    return velocities;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public updateConfig(config: Partial<ActivityAnalysisConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 