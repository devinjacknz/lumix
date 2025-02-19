import { ChainType } from '@lumix/types';

export interface TokenConfig {
  address: string;
  decimals: number;
  symbol: string;
}

export interface GasConfig {
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasLimit?: number;
}

export interface ChainConfig {
  network: ChainType;
  rpcUrl: string;
  privateKey: string;
  tokens: Record<string, TokenConfig>;
  gasSettings?: GasConfig;
}

export interface AIConfig {
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface SecurityConfig {
  encryptionKey: string;
  enableAuditLog: boolean;
  maxTransactionValue: number;
}

export interface MetricsConfig {
  enabled: boolean;
  port: number;
  logLevel: string;
}

export interface CacheConfig {
  redisUrl: string;
  ttl: number;
}

export interface RiskConfig {
  enabled: boolean;
  maxSlippage: number;
  minLiquidity: number;
}

export interface SystemConfig {
  chains: Record<ChainType, ChainConfig>;
  ai: AIConfig;
  security: SecurityConfig;
  metrics: MetricsConfig;
  cache: CacheConfig;
  risk: RiskConfig;
} 