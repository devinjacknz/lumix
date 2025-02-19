import {
  TrustScore,
  PriceDataPoint,
  OracleDataSource,
  ValidatorConfig
} from '../types';

export class TrustScorer {
  private config: Required<ValidatorConfig['trustScoring']>;
  private sourceReputations: Map<string, number>;
  private updateFrequencies: Map<string, number[]>;
  private lastUpdate: Map<string, number>;

  constructor(config: ValidatorConfig['trustScoring'] = {}) {
    this.config = {
      weights: {
        sourceReputation: config.weights?.sourceReputation || 0.3,
        dataFreshness: config.weights?.dataFreshness || 0.2,
        marketLiquidity: config.weights?.marketLiquidity || 0.2,
        priceConsensus: config.weights?.priceConsensus || 0.2,
        updateFrequency: config.weights?.updateFrequency || 0.1
      },
      minScore: config.minScore || 0.5
    };

    this.sourceReputations = new Map();
    this.updateFrequencies = new Map();
    this.lastUpdate = new Map();
  }

  /**
   * 计算可信度评分
   */
  calculateTrustScores(
    dataPoints: PriceDataPoint[],
    sources: OracleDataSource[]
  ): Map<string, TrustScore> {
    const scores = new Map<string, TrustScore>();
    const now = Date.now();

    // 更新数据源声誉
    this.updateSourceReputations(dataPoints, sources);

    // 按交易对分组
    const symbolGroups = this.groupBySymbol(dataPoints);

    // 处理每个交易对
    for (const [symbol, points] of symbolGroups) {
      // 更新更新频率统计
      this.updateFrequencyStats(symbol, points);

      // 计算各个组件的评分
      const sourceReputationScore = this.calculateSourceReputationScore(points);
      const freshnessScore = this.calculateFreshnessScore(points, now);
      const liquidityScore = this.calculateLiquidityScore(points);
      const consensusScore = this.calculateConsensusScore(points);
      const frequencyScore = this.calculateFrequencyScore(symbol);

      // 计算总分
      const components = [
        {
          type: 'source_reputation',
          weight: this.config.weights.sourceReputation,
          score: sourceReputationScore,
          evidence: this.getSourceReputationEvidence(points)
        },
        {
          type: 'data_freshness',
          weight: this.config.weights.dataFreshness,
          score: freshnessScore,
          evidence: this.getFreshnessEvidence(points, now)
        },
        {
          type: 'market_liquidity',
          weight: this.config.weights.marketLiquidity,
          score: liquidityScore,
          evidence: this.getLiquidityEvidence(points)
        },
        {
          type: 'price_consensus',
          weight: this.config.weights.priceConsensus,
          score: consensusScore,
          evidence: this.getConsensusEvidence(points)
        },
        {
          type: 'update_frequency',
          weight: this.config.weights.updateFrequency,
          score: frequencyScore,
          evidence: this.getFrequencyEvidence(symbol)
        }
      ];

      const totalScore = components.reduce(
        (sum, component) => sum + component.score * component.weight,
        0
      );

      // 创建信任评分
      scores.set(symbol, {
        symbol,
        timestamp: now,
        score: totalScore,
        components,
        metadata: {
          volatility: this.calculateVolatility(points),
          liquidity: this.calculateTotalLiquidity(points),
          sourceCount: points.length,
          updateFrequency: this.calculateAverageUpdateFrequency(symbol)
        }
      });
    }

    return scores;
  }

  /**
   * 按交易对分组
   */
  private groupBySymbol(
    dataPoints: PriceDataPoint[]
  ): Map<string, PriceDataPoint[]> {
    const groups = new Map<string, PriceDataPoint[]>();

    for (const point of dataPoints) {
      if (!groups.has(point.symbol)) {
        groups.set(point.symbol, []);
      }
      groups.get(point.symbol).push(point);
    }

    return groups;
  }

  /**
   * 更新数据源声誉
   */
  private updateSourceReputations(
    points: PriceDataPoint[],
    sources: OracleDataSource[]
  ): void {
    const now = Date.now();

    // 更新现有声誉
    for (const source of sources) {
      let reputation = this.sourceReputations.get(source.id) || 0.5;
      
      // 根据数据源权重调整声誉
      reputation = (reputation * 0.8) + (source.weight * 0.2);

      // 根据数据源优先级调整声誉
      reputation *= (1 + source.priority * 0.1);

      // 限制在 0-1 范围内
      reputation = Math.max(0, Math.min(1, reputation));
      
      this.sourceReputations.set(source.id, reputation);
    }

    // 根据数据点质量更新声誉
    for (const point of points) {
      let reputation = this.sourceReputations.get(point.source) || 0.5;

      // 根据数据新鲜度调整
      const age = now - point.timestamp;
      if (age < 5 * 60 * 1000) { // 5分钟内
        reputation *= 1.1;
      } else if (age > 30 * 60 * 1000) { // 30分钟以上
        reputation *= 0.9;
      }

      // 根据置信度调整
      if (point.confidence) {
        reputation *= (0.5 + point.confidence * 0.5);
      }

      // 根据流动性调整
      if (point.metadata?.liquidity) {
        const liquidity = Number(point.metadata.liquidity);
        if (liquidity > 1000000) { // 高流动性
          reputation *= 1.1;
        } else if (liquidity < 100000) { // 低流动性
          reputation *= 0.9;
        }
      }

      // 限制在 0-1 范围内
      reputation = Math.max(0, Math.min(1, reputation));
      
      this.sourceReputations.set(point.source, reputation);
    }
  }

  /**
   * 更新更新频率统计
   */
  private updateFrequencyStats(
    symbol: string,
    points: PriceDataPoint[]
  ): void {
    const frequencies = this.updateFrequencies.get(symbol) || [];
    const lastUpdate = this.lastUpdate.get(symbol) || 0;
    const now = Date.now();

    if (lastUpdate > 0) {
      frequencies.push(now - lastUpdate);
      
      // 保留最近100个更新间隔
      if (frequencies.length > 100) {
        frequencies.shift();
      }
    }

    this.updateFrequencies.set(symbol, frequencies);
    this.lastUpdate.set(symbol, now);
  }

  /**
   * 计算数据源声誉评分
   */
  private calculateSourceReputationScore(
    points: PriceDataPoint[]
  ): number {
    const reputations = points.map(p => 
      this.sourceReputations.get(p.source) || 0.5
    );
    return reputations.reduce((a, b) => a + b, 0) / reputations.length;
  }

  /**
   * 计算数据新鲜度评分
   */
  private calculateFreshnessScore(
    points: PriceDataPoint[],
    now: number
  ): number {
    const ages = points.map(p => now - p.timestamp);
    const maxAge = Math.max(...ages);
    const scores = ages.map(age => 1 - (age / maxAge));
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * 计算流动性评分
   */
  private calculateLiquidityScore(
    points: PriceDataPoint[]
  ): number {
    const liquidities = points
      .filter(p => p.metadata?.liquidity)
      .map(p => Number(p.metadata.liquidity));

    if (liquidities.length === 0) {
      return 0.5;
    }

    const maxLiquidity = Math.max(...liquidities);
    const scores = liquidities.map(l => l / maxLiquidity);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * 计算价格共识评分
   */
  private calculateConsensusScore(
    points: PriceDataPoint[]
  ): number {
    if (points.length < 2) {
      return 0.5;
    }

    const prices = points.map(p => Number(p.price));
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const deviations = prices.map(p => Math.abs((p - mean) / mean));
    const maxDeviation = Math.max(...deviations);

    return 1 - (maxDeviation / 2); // 最大50%的偏差
  }

  /**
   * 计算更新频率评分
   */
  private calculateFrequencyScore(symbol: string): number {
    const frequencies = this.updateFrequencies.get(symbol) || [];
    if (frequencies.length === 0) {
      return 0.5;
    }

    const avgFrequency = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
    const targetFrequency = 5000; // 目标5秒更新一次
    const ratio = targetFrequency / avgFrequency;

    return Math.min(1, Math.max(0, ratio));
  }

  /**
   * 获取数据源声誉证据
   */
  private getSourceReputationEvidence(
    points: PriceDataPoint[]
  ): any {
    return {
      sourceReputations: points.map(p => ({
        source: p.source,
        reputation: this.sourceReputations.get(p.source) || 0.5
      })),
      averageReputation: this.calculateSourceReputationScore(points)
    };
  }

  /**
   * 获取数据新鲜度证据
   */
  private getFreshnessEvidence(
    points: PriceDataPoint[],
    now: number
  ): any {
    return {
      ages: points.map(p => ({
        source: p.source,
        age: now - p.timestamp
      })),
      maxAge: Math.max(...points.map(p => now - p.timestamp)),
      minAge: Math.min(...points.map(p => now - p.timestamp))
    };
  }

  /**
   * 获取流动性证据
   */
  private getLiquidityEvidence(points: PriceDataPoint[]): any {
    const liquidities = points
      .filter(p => p.metadata?.liquidity)
      .map(p => ({
        source: p.source,
        liquidity: p.metadata.liquidity
      }));

    return {
      liquidities,
      totalLiquidity: this.calculateTotalLiquidity(points)
    };
  }

  /**
   * 获取价格共识证据
   */
  private getConsensusEvidence(points: PriceDataPoint[]): any {
    const prices = points.map(p => Number(p.price));
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    return {
      prices: points.map(p => ({
        source: p.source,
        price: p.price,
        deviation: Math.abs((Number(p.price) - mean) / mean)
      })),
      mean,
      maxDeviation: Math.max(...prices.map(p => Math.abs((p - mean) / mean)))
    };
  }

  /**
   * 获取更新频率证据
   */
  private getFrequencyEvidence(symbol: string): any {
    const frequencies = this.updateFrequencies.get(symbol) || [];
    
    return {
      updateIntervals: frequencies,
      averageInterval: this.calculateAverageUpdateFrequency(symbol),
      lastUpdate: this.lastUpdate.get(symbol)
    };
  }

  /**
   * 计算价格波动率
   */
  private calculateVolatility(points: PriceDataPoint[]): number {
    if (points.length < 2) {
      return 0;
    }

    const prices = points.map(p => Number(p.price));
    const returns = [];

    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  /**
   * 计算总流动性
   */
  private calculateTotalLiquidity(points: PriceDataPoint[]): bigint {
    return points.reduce(
      (sum, p) => sum + (p.metadata?.liquidity || BigInt(0)),
      BigInt(0)
    );
  }

  /**
   * 计算平均更新频率
   */
  private calculateAverageUpdateFrequency(symbol: string): number {
    const frequencies = this.updateFrequencies.get(symbol) || [];
    if (frequencies.length === 0) {
      return 0;
    }
    return frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
  }
}