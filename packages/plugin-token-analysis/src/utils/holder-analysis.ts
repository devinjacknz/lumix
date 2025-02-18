import { logger } from "@lumix/core";
import { GiniCalculator } from "./gini";

export interface HolderStats {
  total: number;
  active: number;
  distribution: {
    ranges: {
      range: string;
      count: number;
      balance: string;
      percentage: number;
    }[];
    metrics: {
      gini: number;
      giniConfidence: [number, number];
      theil: number;
      palma: number;
      concentration: number;
    };
  };
  activity: {
    dailyActive: number;
    weeklyActive: number;
    monthlyActive: number;
    retentionRate: number;
    churnRate: number;
    averageHoldingPeriod: number;
  };
  segments: {
    whales: {
      count: number;
      balance: string;
      percentage: number;
      threshold: string;
    };
    institutions: {
      count: number;
      balance: string;
      percentage: number;
      addresses: string[];
    };
    retail: {
      count: number;
      balance: string;
      percentage: number;
      distribution: {
        small: number;
        medium: number;
        large: number;
      };
    };
  };
  patterns: {
    accumulation: {
      detected: boolean;
      strength: number;
      duration: number;
      participants: number;
    };
    distribution: {
      detected: boolean;
      strength: number;
      duration: number;
      participants: number;
    };
    consolidation: {
      detected: boolean;
      strength: number;
      duration: number;
      topHolders: number;
    };
  };
}

export interface HolderAnalysisConfig {
  ranges: {
    min: string;
    max: string;
  }[];
  thresholds: {
    whale: string;
    institution: string;
    retail: {
      small: string;
      medium: string;
      large: string;
    };
  };
  timeframes: {
    active: number;
    retention: number;
    pattern: number;
  };
  patterns: {
    accumulation: {
      minDuration: number;
      minStrength: number;
      minParticipants: number;
    };
    distribution: {
      minDuration: number;
      minStrength: number;
      minParticipants: number;
    };
    consolidation: {
      minDuration: number;
      minStrength: number;
      minTopHolders: number;
    };
  };
}

export interface HolderSnapshot {
  address: string;
  balance: string;
  timestamp: number;
  isContract: boolean;
  lastTransfer: number;
  transferCount: number;
}

export class HolderAnalyzer {
  private static instance: HolderAnalyzer;
  private giniCalculator: GiniCalculator;
  private config: HolderAnalysisConfig;
  private cache: Map<string, {
    stats: HolderStats;
    timestamp: number;
  }>;

  private constructor(config: Partial<HolderAnalysisConfig> = {}) {
    this.giniCalculator = GiniCalculator.getInstance();
    this.config = {
      ranges: [
        { min: "0", max: "100" },
        { min: "100", max: "1000" },
        { min: "1000", max: "10000" },
        { min: "10000", max: "100000" },
        { min: "100000", max: "1000000" },
        { min: "1000000", max: "∞" }
      ],
      thresholds: {
        whale: "1000000",
        institution: "100000",
        retail: {
          small: "1000",
          medium: "10000",
          large: "100000"
        }
      },
      timeframes: {
        active: 7 * 24 * 60 * 60 * 1000, // 7天
        retention: 30 * 24 * 60 * 60 * 1000, // 30天
        pattern: 90 * 24 * 60 * 60 * 1000 // 90天
      },
      patterns: {
        accumulation: {
          minDuration: 7 * 24 * 60 * 60 * 1000, // 7天
          minStrength: 0.1, // 10%
          minParticipants: 100
        },
        distribution: {
          minDuration: 7 * 24 * 60 * 60 * 1000, // 7天
          minStrength: 0.1, // 10%
          minParticipants: 1000
        },
        consolidation: {
          minDuration: 30 * 24 * 60 * 60 * 1000, // 30天
          minStrength: 0.2, // 20%
          minTopHolders: 10
        }
      },
      ...config
    };
    this.cache = new Map();
  }

  public static getInstance(config?: Partial<HolderAnalysisConfig>): HolderAnalyzer {
    if (!HolderAnalyzer.instance) {
      HolderAnalyzer.instance = new HolderAnalyzer(config);
    }
    return HolderAnalyzer.instance;
  }

  public analyze(
    currentHolders: HolderSnapshot[],
    historicalHolders?: HolderSnapshot[][]
  ): HolderStats {
    try {
      // 基本统计
      const total = currentHolders.length;
      const active = this.countActiveHolders(currentHolders);

      // 分布分析
      const distribution = this.analyzeDistribution(currentHolders);

      // 活动分析
      const activity = this.analyzeActivity(currentHolders, historicalHolders);

      // 分段分析
      const segments = this.analyzeSegments(currentHolders);

      // 模式分析
      const patterns = historicalHolders ? 
        this.analyzePatterns(currentHolders, historicalHolders) :
        this.getDefaultPatterns();

      return {
        total,
        active,
        distribution,
        activity,
        segments,
        patterns
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Holder Analyzer", `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private analyzeDistribution(holders: HolderSnapshot[]): HolderStats["distribution"] {
    // 计算范围分布
    const ranges = this.calculateRanges(holders);

    // 计算分布指标
    const balances = holders.map(h => h.balance);
    const gini = this.giniCalculator.calculate(balances);
    const giniConfidence = this.giniCalculator.calculateConfidenceInterval(balances);
    const theil = this.calculateTheilIndex(holders);
    const palma = this.calculatePalmaRatio(holders);
    const concentration = this.calculateConcentrationRatio(holders);

    return {
      ranges,
      metrics: {
        gini,
        giniConfidence,
        theil,
        palma,
        concentration
      }
    };
  }

  private calculateRanges(holders: HolderSnapshot[]): HolderStats["distribution"]["ranges"] {
    return this.config.ranges.map(range => {
      const holdersInRange = holders.filter(h => {
        const balance = BigInt(h.balance);
        const min = BigInt(range.min);
        const max = range.max === "∞" ? 
          BigInt(2) ** BigInt(256) - BigInt(1) : 
          BigInt(range.max);
        return balance >= min && balance <= max;
      });

      const totalBalance = holdersInRange.reduce(
        (sum, h) => sum + BigInt(h.balance),
        BigInt(0)
      );

      return {
        range: `${range.min}-${range.max}`,
        count: holdersInRange.length,
        balance: totalBalance.toString(),
        percentage: holdersInRange.length / holders.length
      };
    });
  }

  private calculateTheilIndex(holders: HolderSnapshot[]): number {
    const balances = holders.map(h => Number(BigInt(h.balance)));
    const mean = balances.reduce((sum, b) => sum + b, 0) / balances.length;

    if (mean === 0) return 0;

    return balances.reduce((sum, balance) => {
      if (balance === 0) return sum;
      const share = balance / mean;
      return sum + (share * Math.log(share));
    }, 0) / balances.length;
  }

  private calculatePalmaRatio(holders: HolderSnapshot[]): number {
    const sortedHolders = [...holders].sort(
      (a, b) => Number(BigInt(b.balance) - BigInt(a.balance))
    );

    const n = holders.length;
    const top10Percent = sortedHolders.slice(0, Math.ceil(n * 0.1));
    const bottom40Percent = sortedHolders.slice(-Math.floor(n * 0.4));

    const top10Sum = top10Percent.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );
    const bottom40Sum = bottom40Percent.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    return bottom40Sum === BigInt(0) ? 0 : 
      Number(top10Sum * BigInt(100) / bottom40Sum) / 100;
  }

  private calculateConcentrationRatio(holders: HolderSnapshot[]): number {
    const sortedHolders = [...holders].sort(
      (a, b) => Number(BigInt(b.balance) - BigInt(a.balance))
    );

    const totalBalance = holders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    if (totalBalance === BigInt(0)) return 0;

    const top10Balance = sortedHolders
      .slice(0, 10)
      .reduce((sum, h) => sum + BigInt(h.balance), BigInt(0));

    return Number(top10Balance * BigInt(100) / totalBalance) / 100;
  }

  private analyzeActivity(
    currentHolders: HolderSnapshot[],
    historicalHolders?: HolderSnapshot[][]
  ): HolderStats["activity"] {
    const now = Date.now();

    // 计算活跃用户
    const dailyActive = this.countActiveHolders(
      currentHolders,
      now - 24 * 60 * 60 * 1000
    );
    const weeklyActive = this.countActiveHolders(
      currentHolders,
      now - 7 * 24 * 60 * 60 * 1000
    );
    const monthlyActive = this.countActiveHolders(
      currentHolders,
      now - 30 * 24 * 60 * 60 * 1000
    );

    // 如果有历史数据，计算保留率和流失率
    let retentionRate = 0;
    let churnRate = 0;
    let averageHoldingPeriod = 0;

    if (historicalHolders && historicalHolders.length > 0) {
      const retentionMetrics = this.calculateRetentionMetrics(
        currentHolders,
        historicalHolders
      );
      retentionRate = retentionMetrics.retentionRate;
      churnRate = retentionMetrics.churnRate;
      averageHoldingPeriod = this.calculateAverageHoldingPeriod(
        currentHolders,
        historicalHolders
      );
    }

    return {
      dailyActive,
      weeklyActive,
      monthlyActive,
      retentionRate,
      churnRate,
      averageHoldingPeriod
    };
  }

  private countActiveHolders(
    holders: HolderSnapshot[],
    since: number = Date.now() - this.config.timeframes.active
  ): number {
    return holders.filter(h => h.lastTransfer >= since).length;
  }

  private calculateRetentionMetrics(
    currentHolders: HolderSnapshot[],
    historicalHolders: HolderSnapshot[][]
  ): {
    retentionRate: number;
    churnRate: number;
  } {
    const retentionPeriod = this.config.timeframes.retention;
    const historicalSnapshot = historicalHolders.find(snapshot => {
      const snapshotTime = snapshot[0]?.timestamp || 0;
      return Date.now() - snapshotTime >= retentionPeriod;
    });

    if (!historicalSnapshot) return { retentionRate: 0, churnRate: 0 };

    const oldAddresses = new Set(historicalSnapshot.map(h => h.address));
    const retainedHolders = currentHolders.filter(h => 
      oldAddresses.has(h.address)
    ).length;

    const retentionRate = retainedHolders / historicalSnapshot.length;
    const churnRate = 1 - retentionRate;

    return { retentionRate, churnRate };
  }

  private calculateAverageHoldingPeriod(
    currentHolders: HolderSnapshot[],
    historicalHolders: HolderSnapshot[][]
  ): number {
    const holdingPeriods: number[] = [];

    currentHolders.forEach(holder => {
      // 查找最早出现的时间
      let firstSeen = holder.timestamp;
      for (const snapshot of historicalHolders) {
        const historicalHolder = snapshot.find(h => h.address === holder.address);
        if (historicalHolder) {
          firstSeen = Math.min(firstSeen, historicalHolder.timestamp);
        }
      }

      holdingPeriods.push(Date.now() - firstSeen);
    });

    if (holdingPeriods.length === 0) return 0;
    return holdingPeriods.reduce((sum, period) => sum + period, 0) / holdingPeriods.length;
  }

  private analyzeSegments(holders: HolderSnapshot[]): HolderStats["segments"] {
    // 分析鲸鱼账户
    const whales = this.analyzeWhales(holders);

    // 分析机构账户
    const institutions = this.analyzeInstitutions(holders);

    // 分析散户账户
    const retail = this.analyzeRetail(holders);

    return {
      whales,
      institutions,
      retail
    };
  }

  private analyzeWhales(holders: HolderSnapshot[]): HolderStats["segments"]["whales"] {
    const whaleThreshold = BigInt(this.config.thresholds.whale);
    const whaleHolders = holders.filter(h => 
      BigInt(h.balance) >= whaleThreshold
    );

    const whaleBalance = whaleHolders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    const totalBalance = holders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    return {
      count: whaleHolders.length,
      balance: whaleBalance.toString(),
      percentage: totalBalance === BigInt(0) ? 0 :
        Number(whaleBalance * BigInt(100) / totalBalance) / 100,
      threshold: this.config.thresholds.whale
    };
  }

  private analyzeInstitutions(holders: HolderSnapshot[]): HolderStats["segments"]["institutions"] {
    const institutionThreshold = BigInt(this.config.thresholds.institution);
    const institutionHolders = holders.filter(h => 
      h.isContract && BigInt(h.balance) >= institutionThreshold
    );

    const institutionBalance = institutionHolders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    const totalBalance = holders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    return {
      count: institutionHolders.length,
      balance: institutionBalance.toString(),
      percentage: totalBalance === BigInt(0) ? 0 :
        Number(institutionBalance * BigInt(100) / totalBalance) / 100,
      addresses: institutionHolders.map(h => h.address)
    };
  }

  private analyzeRetail(holders: HolderSnapshot[]): HolderStats["segments"]["retail"] {
    const { small, medium, large } = this.config.thresholds.retail;
    const smallThreshold = BigInt(small);
    const mediumThreshold = BigInt(medium);
    const largeThreshold = BigInt(large);

    const retailHolders = holders.filter(h => 
      !h.isContract && BigInt(h.balance) < largeThreshold
    );

    const retailBalance = retailHolders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    const totalBalance = holders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    // 分析分布
    const distribution = {
      small: retailHolders.filter(h => BigInt(h.balance) < smallThreshold).length,
      medium: retailHolders.filter(h => {
        const balance = BigInt(h.balance);
        return balance >= smallThreshold && balance < mediumThreshold;
      }).length,
      large: retailHolders.filter(h => {
        const balance = BigInt(h.balance);
        return balance >= mediumThreshold && balance < largeThreshold;
      }).length
    };

    return {
      count: retailHolders.length,
      balance: retailBalance.toString(),
      percentage: totalBalance === BigInt(0) ? 0 :
        Number(retailBalance * BigInt(100) / totalBalance) / 100,
      distribution
    };
  }

  private analyzePatterns(
    currentHolders: HolderSnapshot[],
    historicalHolders: HolderSnapshot[][]
  ): HolderStats["patterns"] {
    return {
      accumulation: this.detectAccumulation(currentHolders, historicalHolders),
      distribution: this.detectDistribution(currentHolders, historicalHolders),
      consolidation: this.detectConsolidation(currentHolders, historicalHolders)
    };
  }

  private detectAccumulation(
    currentHolders: HolderSnapshot[],
    historicalHolders: HolderSnapshot[][]
  ): HolderStats["patterns"]["accumulation"] {
    const config = this.config.patterns.accumulation;
    const period = historicalHolders.filter(snapshot =>
      Date.now() - snapshot[0]?.timestamp <= config.minDuration
    );

    if (period.length < 2) {
      return {
        detected: false,
        strength: 0,
        duration: 0,
        participants: 0
      };
    }

    // 计算累积趋势
    const accumulatingAddresses = new Set<string>();
    let totalIncrease = BigInt(0);

    currentHolders.forEach(current => {
      const oldHolder = period[0].find(h => h.address === current.address);
      if (oldHolder && BigInt(current.balance) > BigInt(oldHolder.balance)) {
        accumulatingAddresses.add(current.address);
        totalIncrease += BigInt(current.balance) - BigInt(oldHolder.balance);
      }
    });

    const totalSupply = currentHolders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    const strength = totalSupply === BigInt(0) ? 0 :
      Number(totalIncrease * BigInt(100) / totalSupply) / 100;

    return {
      detected: 
        strength >= config.minStrength &&
        accumulatingAddresses.size >= config.minParticipants,
      strength,
      duration: Date.now() - period[0][0]?.timestamp,
      participants: accumulatingAddresses.size
    };
  }

  private detectDistribution(
    currentHolders: HolderSnapshot[],
    historicalHolders: HolderSnapshot[][]
  ): HolderStats["patterns"]["distribution"] {
    const config = this.config.patterns.distribution;
    const period = historicalHolders.filter(snapshot =>
      Date.now() - snapshot[0]?.timestamp <= config.minDuration
    );

    if (period.length < 2) {
      return {
        detected: false,
        strength: 0,
        duration: 0,
        participants: 0
      };
    }

    // 计算分发趋势
    const receivingAddresses = new Set<string>();
    let totalDecrease = BigInt(0);

    const oldTopHolders = new Set(
      period[0]
        .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))
        .slice(0, 10)
        .map(h => h.address)
    );

    currentHolders.forEach(current => {
      if (!oldTopHolders.has(current.address)) {
        const oldHolder = period[0].find(h => h.address === current.address);
        if (!oldHolder || BigInt(current.balance) > BigInt(oldHolder.balance)) {
          receivingAddresses.add(current.address);
          totalDecrease += oldHolder ? 
            BigInt(current.balance) - BigInt(oldHolder.balance) :
            BigInt(current.balance);
        }
      }
    });

    const totalSupply = currentHolders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    const strength = totalSupply === BigInt(0) ? 0 :
      Number(totalDecrease * BigInt(100) / totalSupply) / 100;

    return {
      detected:
        strength >= config.minStrength &&
        receivingAddresses.size >= config.minParticipants,
      strength,
      duration: Date.now() - period[0][0]?.timestamp,
      participants: receivingAddresses.size
    };
  }

  private detectConsolidation(
    currentHolders: HolderSnapshot[],
    historicalHolders: HolderSnapshot[][]
  ): HolderStats["patterns"]["consolidation"] {
    const config = this.config.patterns.consolidation;
    const period = historicalHolders.filter(snapshot =>
      Date.now() - snapshot[0]?.timestamp <= config.minDuration
    );

    if (period.length < 2) {
      return {
        detected: false,
        strength: 0,
        duration: 0,
        topHolders: 0
      };
    }

    // 分析前10大持有者的变化
    const oldTopHolders = period[0]
      .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))
      .slice(0, 10);

    const currentTopHolders = currentHolders
      .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))
      .slice(0, 10);

    const oldTopBalance = oldTopHolders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    const currentTopBalance = currentTopHolders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    const totalSupply = currentHolders.reduce(
      (sum, h) => sum + BigInt(h.balance),
      BigInt(0)
    );

    const strength = totalSupply === BigInt(0) ? 0 :
      Number((currentTopBalance - oldTopBalance) * BigInt(100) / totalSupply) / 100;

    const stableTopHolders = currentTopHolders.filter(current =>
      oldTopHolders.some(old => old.address === current.address)
    ).length;

    return {
      detected:
        strength >= config.minStrength &&
        stableTopHolders >= config.minTopHolders,
      strength,
      duration: Date.now() - period[0][0]?.timestamp,
      topHolders: stableTopHolders
    };
  }

  private getDefaultPatterns(): HolderStats["patterns"] {
    return {
      accumulation: {
        detected: false,
        strength: 0,
        duration: 0,
        participants: 0
      },
      distribution: {
        detected: false,
        strength: 0,
        duration: 0,
        participants: 0
      },
      consolidation: {
        detected: false,
        strength: 0,
        duration: 0,
        topHolders: 0
      }
    };
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public updateConfig(config: Partial<HolderAnalysisConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 