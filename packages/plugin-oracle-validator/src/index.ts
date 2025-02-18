export * from './types';
export * from './validator';
export * from './anomaly/detector';
export * from './trust/scorer';

export interface PluginConfig {
  sources: Array<{
    id: string;
    name: string;
    type: 'onchain' | 'api' | 'aggregator';
    endpoint: string;
    credentials?: {
      apiKey?: string;
      secret?: string;
    };
  }>;
  validation?: {
    requiredSources?: number;
    minConfidence?: number;
    updateInterval?: number;
  };
  anomalyDetection?: {
    priceThreshold?: number;
    volumeThreshold?: number;
    maxDataAge?: number;
  };
  trustScoring?: {
    weights?: {
      sourceReputation?: number;
      dataFreshness?: number;
      marketLiquidity?: number;
    };
    minScore?: number;
  };
}

export class OracleValidatorPlugin {
  private config: PluginConfig;
  private validator: OracleValidator;

  constructor(config: PluginConfig) {
    this.config = config;
    this.validator = new OracleValidator({
      sources: config.sources.map(source => ({
        ...source,
        priority: 1,
        weight: 1
      })),
      ...config.validation,
      anomalyDetection: config.anomalyDetection,
      trustScoring: config.trustScoring
    });
  }

  /**
   * 获取验证器实例
   */
  getValidator(): OracleValidator {
    return this.validator;
  }
} 