import { BaseError } from '@lumix/core';

export class AlertError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AlertError';
  }
}

/**
 * 告警严重程度
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * 告警规则
 */
export interface AlertRule {
  // 基础信息
  id: string;
  name: string;
  description?: string;
  severity: AlertSeverity;
  
  // 规则配置
  conditions: Array<{
    type: string;
    operator: 'eq' | 'gt' | 'lt' | 'contains' | 'regex' | 'custom';
    value: any;
    params?: {
      validator?: (value: any, expected: any) => Promise<{
        matched: boolean;
        metadata?: Record<string, any>;
      }>;
      [key: string]: any;
    };
  }>;
  threshold?: number;
  template: string;
  
  // 意图识别
  examples?: string[];
  
  // 元数据
  metadata?: Record<string, any>;
}

/**
 * 告警上下文
 */
export interface AlertContext {
  // 消息内容
  message: string;
  timestamp: number;
  source: string;
  
  // 价格数据
  price?: {
    symbol: string;
    current: number;
    previous: number;
    change: number;
  };
  
  // 交易数据
  volume?: {
    current: number;
    previous: number;
    change: number;
  };
  
  // Gas 数据
  gas?: {
    price: number;
    limit: number;
    used: number;
  };
  
  // 系统数据
  system?: {
    cpu: number;
    memory: number;
    disk: number;
    network: {
      rx: number;
      tx: number;
    };
  };
  
  // 自定义数据
  [key: string]: any;
}

/**
 * 告警结果
 */
export interface AlertResult {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  context: AlertContext;
  metadata?: Record<string, any>;
}

/**
 * 通知配置
 */
export interface NotificationConfig {
  // 通知渠道
  channels: Array<{
    type: 'email' | 'slack' | 'telegram' | 'webhook';
    config: {
      endpoint?: string;
      token?: string;
      [key: string]: any;
    };
    enabled: boolean;
  }>;
  
  // 通知规则
  rules: Array<{
    severity: AlertSeverity[];
    channels: string[];
    template?: string;
    throttle?: {
      count: number;
      window: number;
    };
  }>;
  
  // 通知模板
  templates?: Record<string, string>;
  
  // 重试配置
  retry?: {
    attempts: number;
    delay: number;
  };
}

/**
 * 通知结果
 */
export interface NotificationResult {
  success: boolean;
  alertId: string;
  channels: Array<{
    type: string;
    success: boolean;
    error?: string;
    timestamp: number;
  }>;
  metadata?: Record<string, any>;
}

/**
 * 插件配置
 */
export interface PluginConfig {
  // 规则配置
  rules?: AlertRule[];
  defaultThreshold?: number;
  
  // 通知配置
  notification?: NotificationConfig;
  
  // 上下文配置
  contextTTL?: number;
  maxContextSize?: number;
  
  // 缓存配置
  cacheEnabled?: boolean;
  cacheExpiration?: number;
} 