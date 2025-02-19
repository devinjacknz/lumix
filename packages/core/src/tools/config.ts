import { ToolConfig } from '@lumix/types';

export type ChainType = 'ethereum' | 'solana' | 'polygon' | 'bsc' | 'avalanche';

export interface ChainToolConfig extends ToolConfig {
  chains: ChainType[];
  rpcUrls: Record<ChainType, string>;
  apiKeys?: Record<ChainType, string>;
}

export interface APIToolConfig extends ToolConfig {
  baseUrl: string;
  apiKey?: string;
  apiVersion?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface DataToolConfig extends ToolConfig {
  maxBatchSize: number;
  maxConcurrent: number;
  validateData: boolean;
  backupEnabled: boolean;
}

export interface FileToolConfig extends ToolConfig {
  basePath: string;
  encoding?: string;
  maxSize?: number;
  allowedExtensions?: string[];
}

export interface DatabaseToolConfig extends ToolConfig {
  connectionString: string;
  maxConnections?: number;
  timeout?: number;
  ssl?: boolean;
}

export interface NetworkToolConfig extends ToolConfig {
  host: string;
  port: number;
  protocol?: string;
  timeout?: number;
  retries?: number;
}

export interface CacheToolConfig extends ToolConfig {
  storage: 'memory' | 'redis' | 'file';
  maxSize?: number;
  ttl?: number;
  path?: string;
}

export interface SecurityToolConfig extends ToolConfig {
  encryptionKey?: string;
  algorithm?: string;
  saltRounds?: number;
  tokenExpiry?: number;
}

export const defaultToolConfig: Partial<ToolConfig> = {
  enabled: true,
  priority: 1,
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  cacheEnabled: true,
  cacheTTL: 300000
}; 