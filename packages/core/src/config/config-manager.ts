import { ChainType, SystemConfig, ChainConfig, TokenConfig, AIConfig, SecurityConfig, MetricsConfig, CacheConfig, RiskConfig } from './types';

export class ConfigManager {
  private static instance: ConfigManager;
  private config: SystemConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): SystemConfig {
    const chains: Record<ChainType, ChainConfig> = {
      solana: {
        network: 'solana',
        rpcUrl: process.env.SOLANA_RPC_URL!,
        privateKey: process.env.SOLANA_PRIVATE_KEY!,
        tokens: {} // 将从数据库加载
      },
      ethereum: {
        network: 'ethereum',
        rpcUrl: process.env.ETH_RPC_URL!,
        privateKey: process.env.ETH_PRIVATE_KEY!,
        tokens: {}
      },
      base: {
        network: 'base',
        rpcUrl: process.env.BASE_RPC_URL!,
        privateKey: process.env.BASE_PRIVATE_KEY!,
        tokens: {}
      }
    };

    return {
      chains,
      ai: this.loadAIConfig(),
      security: this.loadSecurityConfig(),
      metrics: this.loadMetricsConfig(),
      cache: this.loadCacheConfig(),
      risk: this.loadRiskConfig()
    };
  }

  private loadAIConfig(): AIConfig {
    return {
      model: process.env.AI_MODEL || 'gpt-4-turbo',
      maxTokens: parseInt(process.env.MAX_TOKENS || '4000'),
      temperature: parseFloat(process.env.TEMPERATURE || '0.7')
    };
  }

  private loadSecurityConfig(): SecurityConfig {
    return {
      encryptionKey: process.env.ENCRYPTION_KEY!,
      enableAuditLog: process.env.ENABLE_AUDIT_LOG === 'true',
      maxTransactionValue: parseFloat(process.env.MAX_TRANSACTION_VALUE || '1000')
    };
  }

  private loadMetricsConfig(): MetricsConfig {
    return {
      enabled: process.env.ENABLE_METRICS === 'true',
      port: parseInt(process.env.METRICS_PORT || '9090'),
      logLevel: process.env.LOG_LEVEL || 'info'
    };
  }

  private loadCacheConfig(): CacheConfig {
    return {
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      ttl: parseInt(process.env.CACHE_TTL || '3600')
    };
  }

  private loadRiskConfig(): RiskConfig {
    return {
      enabled: process.env.RISK_CHECK_ENABLED === 'true',
      maxSlippage: parseFloat(process.env.MAX_SLIPPAGE || '1.0'),
      minLiquidity: parseFloat(process.env.MIN_LIQUIDITY || '10000')
    };
  }

  public getChainConfig(chain: ChainType): ChainConfig {
    return this.config.chains[chain];
  }

  public getAIConfig(): AIConfig {
    return this.config.ai;
  }

  public getSecurityConfig(): SecurityConfig {
    return this.config.security;
  }

  public getMetricsConfig(): MetricsConfig {
    return this.config.metrics;
  }

  public getCacheConfig(): CacheConfig {
    return this.config.cache;
  }

  public getRiskConfig(): RiskConfig {
    return this.config.risk;
  }

  public async updateTokenConfig(chain: ChainType, symbol: string, config: TokenConfig): Promise<void> {
    this.config.chains[chain].tokens[symbol] = config;
    // TODO: 将更新同步到数据库
  }

  public validateConfig(): boolean {
    // 验证必要的配置是否存在
    const requiredEnvVars = [
      'SOLANA_RPC_URL',
      'ETH_RPC_URL',
      'BASE_RPC_URL',
      'ENCRYPTION_KEY'
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    // 验证配置值的合法性
    if (this.config.ai.temperature < 0 || this.config.ai.temperature > 1) {
      throw new Error('AI temperature must be between 0 and 1');
    }

    if (this.config.risk.maxSlippage < 0) {
      throw new Error('Max slippage must be non-negative');
    }

    return true;
  }
} 