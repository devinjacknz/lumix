import { BaseConfig } from './base';

export interface ToolConfig extends BaseConfig {
  name: string;
  description: string;
  enabled?: boolean;
  priority?: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ToolMetadata {
  version: string;
  author?: string;
  license?: string;
  dependencies?: string[];
  tags?: string[];
}

export interface ToolState {
  isEnabled: boolean;
  isInitialized: boolean;
  lastError?: ToolError;
  lastSuccess?: number;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
}

export interface ToolStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  errorRate: number;
  lastUpdated: number;
} 