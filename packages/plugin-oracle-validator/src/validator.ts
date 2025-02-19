import { Cache } from '@lumix/core';
import {
  OracleValidatorError,
  ValidatorConfig,
  ValidationResult,
  PriceDataPoint,
  OracleDataSource
} from './types';
import { AnomalyDetector } from './anomaly/detector';
import { TrustScorer } from './trust/scorer';

export class OracleValidator {
  private config: Required<ValidatorConfig>;
  private anomalyDetector: AnomalyDetector;
  private trustScorer: TrustScorer;
  private cache: Cache;
  private running: boolean;
  private lastValidation: Map<string, number>;

  constructor(config: ValidatorConfig) {
    this.config = {
      sources: config.sources,
      requiredSources: config.requiredSources || 2,
      minConfidence: config.minConfidence || 0.8,
      anomalyDetection: config.anomalyDetection || {},
      trustScoring: config.trustScoring || {},
      updateInterval: config.updateInterval || 60000, // 1分钟
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      cacheResults: config.cacheResults ?? true,
      cacheExpiration: config.cacheExpiration || 5 * 60 * 1000 // 5分钟
    };

    this.anomalyDetector = new AnomalyDetector(this.config.anomalyDetection);
    this.trustScorer = new TrustScorer(this.config.trustScoring);
    this.cache = new Cache();
    this.running = false;
    this.lastValidation = new Map();
  }

  /**
   * 验证预言机数据
   */
  async validateData(
    symbols: string[]
  ): Promise<ValidationResult> {
    try {
      const startTime = Date.now();
      this.running = true;

      // 检查缓存
      if (this.config.cacheResults) {
        const cached = await this.getFromCache(symbols);
        if (cached) return cached;
      }

      // 收集数据
      const dataPoints = await this.collectData(symbols);

      // 检测异常
      const anomalies = this.anomalyDetector.detectAnomalies(dataPoints);

      // 计算可信度评分
      const trustScores = this.trustScorer.calculateTrustScores(
        dataPoints,
        this.config.sources
      );

      // 按符号分组
      const prices = this.groupBySymbol(dataPoints);

      // 计算统计信息
      const stats = this.calculateStats(
        dataPoints,
        anomalies,
        trustScores
      );

      // 创建验证结果
      const result: ValidationResult = {
        prices,
        anomalies,
        trustScores,
        stats,
        metadata: {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          config: this.config
        }
      };

      // 更新缓存
      if (this.config.cacheResults) {
        await this.updateCache(symbols, result);
      }

      return result;
    } catch (error) {
      throw new OracleValidatorError('Failed to validate oracle data', {
        cause: error
      });
    } finally {
      this.running = false;
    }
  }

  /**
   * 从缓存获取结果
   */
  private async getFromCache(
    symbols: string[]
  ): Promise<ValidationResult | null> {
    const key = this.getCacheKey(symbols);
    const cached = await this.cache.get<ValidationResult>(key);

    if (cached && Date.now() - cached.metadata.endTime < this.config.cacheExpiration) {
      return cached;
    }

    return null;
  }

  /**
   * 更新缓存
   */
  private async updateCache(
    symbols: string[],
    result: ValidationResult
  ): Promise<void> {
    const key = this.getCacheKey(symbols);
    await this.cache.set(
      key,
      result,
      this.config.cacheExpiration
    );
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(symbols: string[]): string {
    return `oracle-validation:${symbols.sort().join(',')}`;
  }

  /**
   * 收集数据
   */
  private async collectData(
    symbols: string[]
  ): Promise<PriceDataPoint[]> {
    const dataPoints: PriceDataPoint[] = [];
    const failedSources: Set<string> = new Set();

    for (const source of this.config.sources) {
      try {
        // 检查速率限制
        if (source.rateLimit) {
          const lastUpdate = this.lastValidation.get(source.id) || 0;
          const elapsed = Date.now() - lastUpdate;
          if (elapsed < source.rateLimit.interval) {
            continue;
          }
        }

        // 获取数据
        const points = await this.fetchDataFromSource(
          source,
          symbols
        );

        dataPoints.push(...points);
        this.lastValidation.set(source.id, Date.now());
      } catch (error) {
        console.error(`Failed to fetch data from source ${source.id}:`, error);
        failedSources.add(source.id);

        // 重试
        if (this.config.retryAttempts > 0) {
          await this.retrySource(source, symbols, dataPoints, failedSources);
        }
      }
    }

    // 验证数据源数量
    for (const symbol of symbols) {
      const symbolPoints = dataPoints.filter(p => p.symbol === symbol);
      if (symbolPoints.length < this.config.requiredSources) {
        throw new OracleValidatorError(
          `Insufficient data sources for symbol ${symbol}`
        );
      }
    }

    return dataPoints;
  }

  /**
   * 从数据源获取数据
   */
  private async fetchDataFromSource(
    source: OracleDataSource,
    symbols: string[]
  ): Promise<PriceDataPoint[]> {
    // TODO: 实现数据源获取逻辑
    return [];
  }

  /**
   * 重试数据源
   */
  private async retrySource(
    source: OracleDataSource,
    symbols: string[],
    dataPoints: PriceDataPoint[],
    failedSources: Set<string>
  ): Promise<void> {
    for (let i = 0; i < this.config.retryAttempts; i++) {
      try {
        // 等待重试延迟
        await new Promise(resolve =>
          setTimeout(resolve, this.config.retryDelay)
        );

        // 重试获取数据
        const points = await this.fetchDataFromSource(
          source,
          symbols
        );

        dataPoints.push(...points);
        failedSources.delete(source.id);
        this.lastValidation.set(source.id, Date.now());
        break;
      } catch (error) {
        console.error(
          `Retry ${i + 1} failed for source ${source.id}:`,
          error
        );
      }
    }
  }

  /**
   * 按符号分组
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
   * 计算统计信息
   */
  private calculateStats(
    dataPoints: PriceDataPoint[],
    anomalies: ValidationResult['anomalies'],
    trustScores: ValidationResult['trustScores']
  ): ValidationResult['stats'] {
    const validPoints = dataPoints.filter(p =>
      !anomalies.some(a =>
        a.symbol === p.symbol &&
        a.metadata.sourcesAffected.includes(p.source)
      )
    );

    const avgTrustScore = Array.from(trustScores.values())
      .reduce((sum, score) => sum + score.score, 0) /
      trustScores.size;

    const updateLatencies = Array.from(this.lastValidation.values())
      .map(timestamp => Date.now() - timestamp);
    
    const avgUpdateLatency = updateLatencies.length > 0
      ? updateLatencies.reduce((a, b) => a + b, 0) / updateLatencies.length
      : 0;

    return {
      totalDataPoints: dataPoints.length,
      validDataPoints: validPoints.length,
      anomalyCount: anomalies.length,
      averageTrustScore: avgTrustScore,
      updateLatency: avgUpdateLatency,
      sourcesResponded: Array.from(
        new Set(dataPoints.map(p => p.source))
      ),
      failedSources: Array.from(this.lastValidation.entries())
        .filter(([_, timestamp]) => Date.now() - timestamp > this.config.updateInterval)
        .map(([source, timestamp]) => ({
          source,
          error: 'Source not responding',
          timestamp
        }))
    };
  }
} 