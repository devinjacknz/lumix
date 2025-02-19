import { z } from 'zod';
import { MarketAnalyzer } from '../ai/market-analyzer';
import { ChainProtocol } from '@lumix/types';

export interface BaseToolConfig {
  name: string;
  description: string;
  parameters?: Record<string, string>;
  schema?: z.ZodType;
  timeout?: number;
  version?: string;
}

export interface APIToolConfig extends BaseToolConfig {
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

export interface MarketDataToolConfig extends BaseToolConfig {
  analyzer: MarketAnalyzer;
  chain: ChainProtocol;
  timeframe?: string;
}

export interface ToolRegistryConfig {
  maxTools?: number;
  defaultTimeout?: number;
  cacheEnabled?: boolean;
  cacheExpiry?: number;
}

export interface ToolFactoryConfig {
  registry: ToolRegistryConfig;
  defaultConfig?: BaseToolConfig;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ToolMetadata {
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
}

export interface ToolState {
  enabled: boolean;
  lastRun?: Date;
  runCount: number;
  errorCount: number;
  averageRuntime?: number;
  metadata?: Record<string, any>;
}

export interface ToolStats {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageRuntime: number;
  lastRuntime?: number;
  lastError?: string;
  uptime: number;
} 