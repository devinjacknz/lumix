import { ChainType } from '../types/chain';
import { MarketAnalyzer } from '../analysis/analyzer';

export interface BaseToolConfig {
  name: string;
  description: string;
  parameters?: Record<string, string>;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface APIToolConfig extends BaseToolConfig {
  apiKey: string;
  baseUrl: string;
  headers?: Record<string, string>;
}

export interface MarketDataToolConfig extends BaseToolConfig {
  analyzer: MarketAnalyzer;
  chain: ChainType;
  timeframe?: string;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ToolMetadata {
  startTime: number;
  endTime: number;
  duration: number;
  attempts: number;
}

export interface ToolState {
  isInitialized: boolean;
  isRunning: boolean;
  lastRun?: Date;
  lastError?: ToolError;
  metadata?: ToolMetadata;
}

export interface ToolStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageDuration: number;
  errorRate: number;
} 