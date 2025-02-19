import { BaseConfig } from './base';

export interface MetricsConfig extends BaseConfig {
  enabled: boolean;
  interval?: number;
  prefix?: string;
  labels?: Record<string, string>;
}

export interface MetricsResult {
  success: boolean;
  data?: Record<string, MetricValue>;
  error?: MetricsError;
  timestamp: number;
}

export interface MetricsError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface MetricsCollector {
  collect(): Promise<MetricsResult>;
  reset(): void;
  recordMetric(name: string, value: number, labels?: string): void;
  export(): Record<string, MetricValue>;
}

export type MetricValue = number | string | boolean;

export type MetricName = string;

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export type MetricUnit = 'bytes' | 'seconds' | 'count' | 'percentage';

export interface MetricTags {
  [key: string]: string;
}

export interface MetricLabels {
  [key: string]: string;
}

export enum AlertType {
  SYSTEM = 'system',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  PLUGIN = 'plugin',
  OPTIMIZATION = 'optimization'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  source?: string;
  details?: Record<string, any>;
} 