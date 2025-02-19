import {
  OracleDataSource,
  PriceDataPoint,
  OracleValidatorError
} from '../types';

export interface ComparisonConfig {
  // 数据源配置
  minSources?: number;
  maxDeviation?: number;
  timeWindow?: number;
  
  // 权重配置
  sourceWeights?: Record<string, number>;
  defaultWeight?: number;
  
  // 聚合配置
  aggregationMethod?: 'median' | 'weighted_average' | 'trimmed_mean';
  outlierThreshold?: number;
  
  // 重试配置
  retryAttempts?: number;
  retryDelay?: number;
}

export interface ComparisonResult {
  // 基础信息
  symbol: string;
  timestamp: number;
  aggregatedPrice: bigint;
  
  // 数据源信息
  sources: Array<{
    id: string;
    price: bigint;
    weight: number;
    deviation: number;
    isOutlier: boolean;
  }>;
  
  // 统计信息
  stats: {
    mean: number;
    median: number;
    stdDev: number;
    minPrice: bigint;
    maxPrice: bigint;
    validSources: number;
    outliers: number;
  };
  
  // 元数据
  metadata: {
    method: string;
    timeWindow: number;
    threshold: number;
    confidence: number;
  };
}

export class DataComparator {
  private config: Required<ComparisonConfig>;
  private sources: Map<string, OracleDataSource>;
  private lastComparison: Map<string, ComparisonResult>;

  constructor(config: ComparisonConfig = {}) {
    this.config = {
      minSources: config.minSources || 3,
      maxDeviation: config.maxDeviation || 0.05, // 5%
      timeWindow: config.timeWindow || 60000, // 1分钟
      sourceWeights: config.sourceWeights || {},
      defaultWeight: config.defaultWeight || 1,
      aggregationMethod: config.aggregationMethod || 'weighted_average',
      outlierThreshold: config.outlierThreshold || 2, // 2个标准差
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000
    };
    
    this.sources = new Map();
    this.lastComparison = new Map();
  }

  /**
   * 添加数据源
   */
  addSource(source: OracleDataSource): void {
    this.sources.set(source.id, source);
  }

  /**
   * 移除数据源
   */
  removeSource(sourceId: string): void {
    this.sources.delete(sourceId);
  }

  /**
   * 比较数据源
   */
  async compareData(
    symbol: string,
    dataPoints: PriceDataPoint[]
  ): Promise<ComparisonResult> {
    try {
      // 验证数据源数量
      if (dataPoints.length < this.config.minSources) {
        throw new OracleValidatorError(
          `Insufficient data sources: ${dataPoints.length} < ${this.config.minSources}`
        );
      }

      // 过滤过期数据
      const now = Date.now();
      const validPoints = dataPoints.filter(point =>
        now - point.timestamp <= this.config.timeWindow
      );

      if (validPoints.length < this.config.minSources) {
        throw new OracleValidatorError(
          `Insufficient valid data points: ${validPoints.length} < ${this.config.minSources}`
        );
      }

      // 计算统计信息
      const stats = this.calculateStats(validPoints);

      // 检测异常值
      const outliers = this.detectOutliers(validPoints, stats);

      // 聚合价格
      const aggregatedPrice = this.aggregatePrice(
        validPoints.filter(p => !outliers.has(p)),
        stats
      );

      // 计算每个数据源的偏差
      const sources = validPoints.map(point => {
        const deviation = Number(
          (point.price - aggregatedPrice) * BigInt(100) / aggregatedPrice
        ) / 100;
        
        return {
          id: point.source,
          price: point.price,
          weight: this.getSourceWeight(point.source),
          deviation,
          isOutlier: outliers.has(point)
        };
      });

      // 创建比较结果
      const result: ComparisonResult = {
        symbol,
        timestamp: now,
        aggregatedPrice,
        sources,
        stats: {
          mean: stats.mean,
          median: stats.median,
          stdDev: stats.stdDev,
          minPrice: stats.minPrice,
          maxPrice: stats.maxPrice,
          validSources: validPoints.length,
          outliers: outliers.size
        },
        metadata: {
          method: this.config.aggregationMethod,
          timeWindow: this.config.timeWindow,
          threshold: this.config.outlierThreshold,
          confidence: this.calculateConfidence(validPoints, outliers)
        }
      };

      this.lastComparison.set(symbol, result);
      return result;
    } catch (error) {
      throw new OracleValidatorError('Failed to compare data sources', {
        cause: error
      });
    }
  }

  /**
   * 获取上次比较结果
   */
  getLastComparison(symbol: string): ComparisonResult | undefined {
    return this.lastComparison.get(symbol);
  }

  /**
   * 计算统计信息
   */
  private calculateStats(points: PriceDataPoint[]): {
    mean: number;
    median: number;
    stdDev: number;
    minPrice: bigint;
    maxPrice: bigint;
  } {
    const prices = points.map(p => Number(p.price));
    const weights = points.map(p => this.getSourceWeight(p.source));
    
    // 计算加权平均值
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const mean = prices.reduce(
      (sum, price, i) => sum + price * weights[i] / totalWeight,
      0
    );

    // 计算中位数
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const median = sortedPrices.length % 2 === 0
      ? (sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2
      : sortedPrices[Math.floor(sortedPrices.length / 2)];

    // 计算标准差
    const variance = prices.reduce(
      (sum, price, i) => sum + weights[i] * Math.pow(price - mean, 2) / totalWeight,
      0
    );
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      median,
      stdDev,
      minPrice: BigInt(Math.min(...prices)),
      maxPrice: BigInt(Math.max(...prices))
    };
  }

  /**
   * 检测异常值
   */
  private detectOutliers(
    points: PriceDataPoint[],
    stats: { mean: number; stdDev: number }
  ): Set<PriceDataPoint> {
    const outliers = new Set<PriceDataPoint>();

    for (const point of points) {
      const zscore = Math.abs(Number(point.price) - stats.mean) / stats.stdDev;
      if (zscore > this.config.outlierThreshold) {
        outliers.add(point);
      }
    }

    return outliers;
  }

  /**
   * 聚合价格
   */
  private aggregatePrice(
    points: PriceDataPoint[],
    stats: { mean: number; median: number }
  ): bigint {
    switch (this.config.aggregationMethod) {
      case 'median':
        return BigInt(Math.round(stats.median));
      
      case 'trimmed_mean': {
        // 移除最高和最低 25% 的价格
        const prices = points.map(p => Number(p.price)).sort((a, b) => a - b);
        const trimSize = Math.floor(prices.length * 0.25);
        const trimmedPrices = prices.slice(trimSize, prices.length - trimSize);
        const trimmedMean = trimmedPrices.reduce((a, b) => a + b) / trimmedPrices.length;
        return BigInt(Math.round(trimmedMean));
      }
      
      case 'weighted_average':
      default: {
        const weights = points.map(p => this.getSourceWeight(p.source));
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const weightedSum = points.reduce(
          (sum, point, i) => sum + Number(point.price) * weights[i],
          0
        );
        return BigInt(Math.round(weightedSum / totalWeight));
      }
    }
  }

  /**
   * 获取数据源权重
   */
  private getSourceWeight(sourceId: string): number {
    return this.config.sourceWeights[sourceId] || this.config.defaultWeight;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    points: PriceDataPoint[],
    outliers: Set<PriceDataPoint>
  ): number {
    // 基于有效数据源数量的置信度
    const sourceFactor = Math.min(
      (points.length - outliers.size) / this.config.minSources,
      1
    );

    // 基于数据新鲜度的置信度
    const now = Date.now();
    const ageFactor = points.reduce(
      (sum, point) => sum + (1 - (now - point.timestamp) / this.config.timeWindow),
      0
    ) / points.length;

    // 基于异常值比例的置信度
    const outlierFactor = 1 - outliers.size / points.length;

    // 综合计算置信度
    return (sourceFactor * 0.4 + ageFactor * 0.3 + outlierFactor * 0.3);
  }
} 