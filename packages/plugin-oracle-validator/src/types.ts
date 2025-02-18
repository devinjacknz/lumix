import { BaseError } from '@lumix/core';

export class OracleValidatorError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OracleValidatorError';
  }
}

/**
 * 预言机数据源
 */
export interface OracleDataSource {
  id: string;
  name: string;
  type: 'onchain' | 'api' | 'aggregator';
  endpoint: string;
  credentials?: {
    apiKey?: string;
    secret?: string;
  };
  rateLimit?: {
    requests: number;
    interval: number; // 毫秒
  };
  timeout?: number;
  priority: number;
  weight: number;
  metadata?: Record<string, any>;
}

/**
 * 价格数据点
 */
export interface PriceDataPoint {
  source: string;
  symbol: string;
  price: bigint;
  timestamp: number;
  volume?: bigint;
  confidence?: number;
  metadata?: {
    blockNumber?: number;
    txHash?: string;
    marketCap?: bigint;
    liquidity?: bigint;
    spread?: number;
  };
}

/**
 * 异常值类型
 */
export enum AnomalyType {
  PRICE_SPIKE = 'price_spike',
  VOLUME_SPIKE = 'volume_spike',
  SOURCE_DEVIATION = 'source_deviation',
  LIQUIDITY_DROP = 'liquidity_drop',
  CONFIDENCE_DROP = 'confidence_drop',
  STALE_DATA = 'stale_data'
}

/**
 * 异常值检测结果
 */
export interface AnomalyDetectionResult {
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  symbol: string;
  timestamp: number;
  value: number;
  threshold: number;
  metadata: {
    sourcesAffected: string[];
    duration: number;
    impact: number;
    evidence: Record<string, any>;
  };
}

/**
 * 数据可信度评分
 */
export interface TrustScore {
  symbol: string;
  timestamp: number;
  score: number;
  components: Array<{
    type: string;
    weight: number;
    score: number;
    evidence: any;
  }>;
  metadata?: {
    volatility?: number;
    liquidity?: bigint;
    sourceCount?: number;
    updateFrequency?: number;
  };
}

/**
 * 验证配置
 */
export interface ValidatorConfig {
  // 数据源配置
  sources: OracleDataSource[];
  requiredSources?: number;
  minConfidence?: number;
  
  // 异常检测配置
  anomalyDetection?: {
    priceThreshold?: number;
    volumeThreshold?: number;
    maxDataAge?: number;
    deviationThreshold?: number;
    liquidityThreshold?: bigint;
    confidenceThreshold?: number;
  };

  // 可信度评分配置
  trustScoring?: {
    weights?: {
      sourceReputation?: number;
      dataFreshness?: number;
      marketLiquidity?: number;
      priceConsensus?: number;
      updateFrequency?: number;
    };
    minScore?: number;
  };

  // 更新配置
  updateInterval?: number;
  retryAttempts?: number;
  retryDelay?: number;
  
  // 缓存配置
  cacheResults?: boolean;
  cacheExpiration?: number;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  // 价格数据
  prices: Map<string, PriceDataPoint[]>;
  
  // 异常检测
  anomalies: AnomalyDetectionResult[];
  
  // 可信度评分
  trustScores: Map<string, TrustScore>;
  
  // 统计信息
  stats: {
    totalDataPoints: number;
    validDataPoints: number;
    anomalyCount: number;
    averageTrustScore: number;
    updateLatency: number;
    sourcesResponded: string[];
    failedSources: Array<{
      source: string;
      error: string;
      timestamp: number;
    }>;
  };
  
  // 元数据
  metadata: {
    startTime: number;
    endTime: number;
    duration: number;
    config: ValidatorConfig;
  };
}

export interface AnomalyDetector {
  detectAnomalies(dataPoints: PriceDataPoint[]): AnomalyDetectionResult[];
} 