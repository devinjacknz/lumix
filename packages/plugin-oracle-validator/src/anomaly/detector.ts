import {
  AnomalyDetector as IAnomalyDetector,
  AnomalyType,
  AnomalyDetectionResult,
  PriceDataPoint,
  ValidatorConfig
} from '../types';

export class AnomalyDetector implements IAnomalyDetector {
  private config: Required<ValidatorConfig['anomalyDetection']>;
  private historicalData: Map<string, PriceDataPoint[]>;
  private lastUpdate: Map<string, number>;

  constructor(config: ValidatorConfig['anomalyDetection'] = {}) {
    this.config = {
      priceThreshold: config.priceThreshold || 0.1, // 10% 价格变化阈值
      volumeThreshold: config.volumeThreshold || 0.5, // 50% 交易量变化阈值
      maxDataAge: config.maxDataAge || 5 * 60 * 1000, // 5分钟数据过期时间
      deviationThreshold: config.deviationThreshold || 0.2, // 20% 偏差阈值
      liquidityThreshold: config.liquidityThreshold || BigInt(1000000), // 最小流动性要求
      confidenceThreshold: config.confidenceThreshold || 0.8 // 最小置信度要求
    };

    this.historicalData = new Map();
    this.lastUpdate = new Map();
  }

  /**
   * 检测异常值
   */
  detectAnomalies(dataPoints: PriceDataPoint[]): AnomalyDetectionResult[] {
    const anomalies: AnomalyDetectionResult[] = [];
    const now = Date.now();

    // 按交易对分组
    const symbolGroups = this.groupBySymbol(dataPoints);

    // 处理每个交易对
    for (const [symbol, points] of symbolGroups) {
      // 更新历史数据
      this.updateHistoricalData(symbol, points);

      // 检测各类异常
      anomalies.push(
        ...this.detectPriceAnomalies(symbol, points),
        ...this.detectVolumeAnomalies(symbol, points),
        ...this.detectSourceDeviations(symbol, points),
        ...this.detectLiquidityAnomalies(symbol, points),
        ...this.detectConfidenceAnomalies(symbol, points),
        ...this.detectStaleData(symbol, points, now)
      );
    }

    // 去重并返回
    return this.deduplicateAnomalies(anomalies);
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
   * 更新历史数据
   */
  private updateHistoricalData(
    symbol: string,
    points: PriceDataPoint[]
  ): void {
    let history = this.historicalData.get(symbol) || [];
    const now = Date.now();

    // 添加新数据点
    history.push(...points);

    // 移除超过24小时的数据
    history = history.filter(p => 
      now - p.timestamp < 24 * 60 * 60 * 1000
    );

    // 按时间戳排序
    history.sort((a, b) => a.timestamp - b.timestamp);

    this.historicalData.set(symbol, history);
    this.lastUpdate.set(symbol, now);
  }

  /**
   * 检测价格异常
   */
  private detectPriceAnomalies(
    symbol: string,
    points: PriceDataPoint[]
  ): AnomalyDetectionResult[] {
    const anomalies: AnomalyDetectionResult[] = [];
    const history = this.historicalData.get(symbol) || [];

    if (history.length < 2) {
      return anomalies;
    }

    // 计算历史价格统计数据
    const stats = this.calculatePriceStats(history);

    // 检查每个新数据点
    for (const point of points) {
      const price = Number(point.price);
      const change = Math.abs((price - stats.mean) / stats.mean);

      if (change > this.config.priceThreshold) {
        const severity = this.calculatePriceAnomalySeverity(change);
        anomalies.push({
          type: AnomalyType.PRICE_SPIKE,
          severity,
          symbol,
          timestamp: point.timestamp,
          value: change,
          threshold: this.config.priceThreshold,
          metadata: {
            sourcesAffected: [point.source],
            duration: 0,
            impact: change,
            evidence: {
              price,
              mean: stats.mean,
              stdDev: stats.stdDev
            }
          }
        });
      }
    }

    return anomalies;
  }

  /**
   * 检测交易量异常
   */
  private detectVolumeAnomalies(
    symbol: string,
    points: PriceDataPoint[]
  ): AnomalyDetectionResult[] {
    const anomalies: AnomalyDetectionResult[] = [];
    const history = this.historicalData.get(symbol) || [];

    if (history.length < 2) {
      return anomalies;
    }

    // 计算历史交易量统计数据
    const stats = this.calculateVolumeStats(history);

    // 检查每个新数据点
    for (const point of points) {
      if (!point.volume) continue;

      const volume = Number(point.volume);
      const change = Math.abs((volume - stats.mean) / stats.mean);

      if (change > this.config.volumeThreshold) {
        const severity = this.calculateVolumeAnomalySeverity(change);
        anomalies.push({
          type: AnomalyType.VOLUME_SPIKE,
          severity,
          symbol,
          timestamp: point.timestamp,
          value: change,
          threshold: this.config.volumeThreshold,
          metadata: {
            sourcesAffected: [point.source],
            duration: 0,
            impact: change,
            evidence: {
              volume,
              mean: stats.mean,
              stdDev: stats.stdDev
            }
          }
        });
      }
    }

    return anomalies;
  }

  /**
   * 检测数据源偏差
   */
  private detectSourceDeviations(
    symbol: string,
    points: PriceDataPoint[]
  ): AnomalyDetectionResult[] {
    const anomalies: AnomalyDetectionResult[] = [];

    if (points.length < 2) {
      return anomalies;
    }

    // 计算平均价格
    const prices = points.map(p => Number(p.price));
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;

    // 检查每个数据源的偏差
    for (const point of points) {
      const price = Number(point.price);
      const deviation = Math.abs((price - mean) / mean);

      if (deviation > this.config.deviationThreshold) {
        const severity = this.calculateDeviationAnomalySeverity(deviation);
        anomalies.push({
          type: AnomalyType.SOURCE_DEVIATION,
          severity,
          symbol,
          timestamp: point.timestamp,
          value: deviation,
          threshold: this.config.deviationThreshold,
          metadata: {
            sourcesAffected: [point.source],
            duration: 0,
            impact: deviation,
            evidence: {
              price,
              mean,
              otherSources: points
                .filter(p => p.source !== point.source)
                .map(p => ({
                  source: p.source,
                  price: p.price
                }))
            }
          }
        });
      }
    }

    return anomalies;
  }

  /**
   * 检测流动性异常
   */
  private detectLiquidityAnomalies(
    symbol: string,
    points: PriceDataPoint[]
  ): AnomalyDetectionResult[] {
    const anomalies: AnomalyDetectionResult[] = [];

    for (const point of points) {
      if (!point.metadata?.liquidity) continue;

      const liquidity = point.metadata.liquidity;
      if (liquidity < this.config.liquidityThreshold) {
        const severity = this.calculateLiquidityAnomalySeverity(
          liquidity,
          this.config.liquidityThreshold
        );
        anomalies.push({
          type: AnomalyType.LIQUIDITY_DROP,
          severity,
          symbol,
          timestamp: point.timestamp,
          value: Number(liquidity),
          threshold: Number(this.config.liquidityThreshold),
          metadata: {
            sourcesAffected: [point.source],
            duration: 0,
            impact: Number(
              (this.config.liquidityThreshold - liquidity) /
              this.config.liquidityThreshold
            ),
            evidence: {
              liquidity,
              threshold: this.config.liquidityThreshold
            }
          }
        });
      }
    }

    return anomalies;
  }

  /**
   * 检测置信度异常
   */
  private detectConfidenceAnomalies(
    symbol: string,
    points: PriceDataPoint[]
  ): AnomalyDetectionResult[] {
    const anomalies: AnomalyDetectionResult[] = [];

    for (const point of points) {
      if (!point.confidence) continue;

      if (point.confidence < this.config.confidenceThreshold) {
        const severity = this.calculateConfidenceAnomalySeverity(point.confidence);
        anomalies.push({
          type: AnomalyType.CONFIDENCE_DROP,
          severity,
          symbol,
          timestamp: point.timestamp,
          value: point.confidence,
          threshold: this.config.confidenceThreshold,
          metadata: {
            sourcesAffected: [point.source],
            duration: 0,
            impact: this.config.confidenceThreshold - point.confidence,
            evidence: {
              confidence: point.confidence,
              threshold: this.config.confidenceThreshold
            }
          }
        });
      }
    }

    return anomalies;
  }

  /**
   * 检测数据过期
   */
  private detectStaleData(
    symbol: string,
    points: PriceDataPoint[],
    now: number
  ): AnomalyDetectionResult[] {
    const anomalies: AnomalyDetectionResult[] = [];

    for (const point of points) {
      const age = now - point.timestamp;
      if (age > this.config.maxDataAge) {
        const severity = this.calculateStaleDataAnomalySeverity(age);
        anomalies.push({
          type: AnomalyType.STALE_DATA,
          severity,
          symbol,
          timestamp: point.timestamp,
          value: age,
          threshold: this.config.maxDataAge,
          metadata: {
            sourcesAffected: [point.source],
            duration: age,
            impact: age / this.config.maxDataAge,
            evidence: {
              age,
              maxAge: this.config.maxDataAge,
              lastUpdate: point.timestamp
            }
          }
        });
      }
    }

    return anomalies;
  }

  /**
   * 计算价格统计数据
   */
  private calculatePriceStats(
    history: PriceDataPoint[]
  ): { mean: number; stdDev: number } {
    const prices = history.map(p => Number(p.price));
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev };
  }

  /**
   * 计算交易量统计数据
   */
  private calculateVolumeStats(
    history: PriceDataPoint[]
  ): { mean: number; stdDev: number } {
    const volumes = history
      .filter(p => p.volume)
      .map(p => Number(p.volume));

    if (volumes.length === 0) {
      return { mean: 0, stdDev: 0 };
    }

    const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const variance = volumes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / volumes.length;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev };
  }

  /**
   * 计算价格异常严重程度
   */
  private calculatePriceAnomalySeverity(
    change: number
  ): AnomalyDetectionResult['severity'] {
    if (change > 0.5) return 'critical';
    if (change > 0.3) return 'high';
    if (change > 0.2) return 'medium';
    return 'low';
  }

  /**
   * 计算交易量异常严重程度
   */
  private calculateVolumeAnomalySeverity(
    change: number
  ): AnomalyDetectionResult['severity'] {
    if (change > 2.0) return 'critical';
    if (change > 1.5) return 'high';
    if (change > 1.0) return 'medium';
    return 'low';
  }

  /**
   * 计算偏差异常严重程度
   */
  private calculateDeviationAnomalySeverity(
    deviation: number
  ): AnomalyDetectionResult['severity'] {
    if (deviation > 0.4) return 'critical';
    if (deviation > 0.3) return 'high';
    if (deviation > 0.2) return 'medium';
    return 'low';
  }

  /**
   * 计算流动性异常严重程度
   */
  private calculateLiquidityAnomalySeverity(
    liquidity: bigint,
    threshold: bigint
  ): AnomalyDetectionResult['severity'] {
    const ratio = Number(liquidity) / Number(threshold);
    if (ratio < 0.3) return 'critical';
    if (ratio < 0.5) return 'high';
    if (ratio < 0.7) return 'medium';
    return 'low';
  }

  /**
   * 计算置信度异常严重程度
   */
  private calculateConfidenceAnomalySeverity(
    confidence: number
  ): AnomalyDetectionResult['severity'] {
    if (confidence < 0.5) return 'critical';
    if (confidence < 0.6) return 'high';
    if (confidence < 0.7) return 'medium';
    return 'low';
  }

  /**
   * 计算数据过期严重程度
   */
  private calculateStaleDataAnomalySeverity(
    age: number
  ): AnomalyDetectionResult['severity'] {
    const ratio = age / this.config.maxDataAge;
    if (ratio > 2.0) return 'critical';
    if (ratio > 1.5) return 'high';
    if (ratio > 1.2) return 'medium';
    return 'low';
  }

  /**
   * 去重异常
   */
  private deduplicateAnomalies(
    anomalies: AnomalyDetectionResult[]
  ): AnomalyDetectionResult[] {
    const uniqueAnomalies = new Map<string, AnomalyDetectionResult>();

    for (const anomaly of anomalies) {
      const key = `${anomaly.type}:${anomaly.symbol}:${anomaly.timestamp}`;
      const existing = uniqueAnomalies.get(key);

      if (!existing || anomaly.value > existing.value) {
        uniqueAnomalies.set(key, anomaly);
      }
    }

    return Array.from(uniqueAnomalies.values());
  }
} 