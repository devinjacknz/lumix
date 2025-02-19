import { ChainType } from '../config/types';
import { AlertSeverity } from './alerts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  module: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface MetricValue {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

export interface ChainMetrics {
  chain: ChainType;
  blockHeight: number;
  transactionCount: number;
  gasPrice?: string;
  timestamp: Date;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  timestamp: Date;
}

export interface MonitoringConfig {
  // 基本配置
  enabled: boolean;
  logLevel: LogLevel;
  logRetentionDays: number;
  metricsRetentionDays: number;
  checkInterval: number;
  
  // 告警配置
  alerts: {
    enabled: boolean;
    minSeverity: AlertSeverity;
    cleanupAge: number;
    notifications: {
      email?: string[];
      webhook?: string[];
      slack?: string;
      telegram?: string;
    };
  };

  // 系统阈值
  thresholds: {
    // 系统资源
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    
    // 链相关
    chainSyncDelay: number;
    gasPrice: Record<ChainType, number>;
    blockDelay: Record<ChainType, number>;
    
    // 交易相关
    transactionTimeout: number;
    queueSize: number;
    messageProcessingTime: number;
    retryAttempts: number;
    
    // API相关
    apiLatency: number;
    apiErrorRate: number;
    apiRateLimit: number;
    
    // 资金相关
    balanceWarning: Record<ChainType, string>;
    spendingLimit: Record<ChainType, string>;
    
    // LLM相关
    llmLatency: number;
    llmCostDaily: number;
    llmErrorRate: number;
    
    // 安全相关
    keyRotationAge: number;
    suspiciousActivityThreshold: number;
  };

  // 监控目标
  targets: {
    // 系统监控
    system: {
      enabled: boolean;
      resources: boolean;
      processes: boolean;
      network: boolean;
    };
    
    // 链监控
    chains: Record<ChainType, {
      enabled: boolean;
      rpc: boolean;
      transactions: boolean;
      balances: boolean;
    }>;
    
    // 服务监控
    services: {
      database: boolean;
      messageQueue: boolean;
      api: boolean;
      llm: boolean;
      security: boolean;
    };
  };

  // 指标收集
  metrics: {
    enabled: boolean;
    port: number;
    path: string;
    labels: Record<string, string>;
    customMetrics: Array<{
      name: string;
      help: string;
      type: 'counter' | 'gauge' | 'histogram';
    }>;
  };

  // 日志配置
  logging: {
    console: boolean;
    file: boolean;
    database: boolean;
    format: 'json' | 'text';
    maxFiles: number;
    maxSize: number;
    path: string;
  };
}

export interface Alert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  acknowledged: boolean;
}

export interface MetricsCollector {
  recordMetric(name: string, value: number, labels?: Record<string, string>): void;
  getMetrics(): Promise<Record<string, MetricValue[]>>;
}

export interface LogStorage {
  write(entry: LogEntry): Promise<void>;
  query(options: {
    level?: LogLevel;
    module?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<LogEntry[]>;
}

// 监控状态
export interface MonitoringStatus {
  healthy: boolean;
  timestamp: Date;
  components: {
    system: {
      healthy: boolean;
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
      lastCheck: Date;
    };
    chains: Record<ChainType, {
      healthy: boolean;
      blockHeight: number;
      syncDelay: number;
      lastCheck: Date;
    }>;
    services: {
      database: {
        healthy: boolean;
        latency: number;
        lastCheck: Date;
      };
      messageQueue: {
        healthy: boolean;
        queueSize: number;
        processedCount: number;
        lastCheck: Date;
      };
      api: {
        healthy: boolean;
        requestCount: number;
        errorRate: number;
        lastCheck: Date;
      };
      llm: {
        healthy: boolean;
        requestCount: number;
        costToday: number;
        lastCheck: Date;
      };
    };
  };
  alerts: {
    active: number;
    critical: number;
    warning: number;
    lastTriggered: Date;
  };
}

// 监控事件
export interface MonitoringEvent {
  type: string;
  timestamp: Date;
  source: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
}

// 性能指标
export interface PerformanceMetrics {
  timestamp: Date;
  duration: number;
  operation: string;
  success: boolean;
  metadata?: Record<string, any>;
}

// 资源使用情况
export interface ResourceUsage {
  timestamp: Date;
  cpu: {
    usage: number;
    load: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    connections: number;
  };
} 