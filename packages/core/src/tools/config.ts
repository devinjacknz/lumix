import { ChainType } from '../types';

export interface ToolConfig {
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

export interface ChainToolConfig extends ToolConfig {
  chains: ChainType[];
  rpcUrls: Record<ChainType, string>;
  apiKeys?: Record<ChainType, string>;
}

export interface APIToolConfig extends ToolConfig {
  baseUrl: string;
  apiKey?: string;
  rateLimit?: {
    maxRequests: number;
    interval: number;
  };
}

export interface DataToolConfig extends ToolConfig {
  maxBatchSize: number;
  maxConcurrent: number;
  validateData: boolean;
  backupEnabled: boolean;
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