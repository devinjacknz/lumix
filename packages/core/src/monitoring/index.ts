export * from './types';
export * from './logger';
export * from './metrics';
export * from './alerts';
export * from './system-monitor';

// 导出单例实例
import { Logger } from './logger';
import { MetricsService } from './metrics';
import { AlertManager } from './alerts';
import { SystemMonitor } from './system-monitor';

// 默认告警配置
const defaultAlertConfig = {
  enabled: true,
  minSeverity: 'warning',
  cleanupAge: 7 * 24 * 60 * 60 * 1000, // 7天
  notifications: {}
};

// 默认监控配置
const defaultMonitoringConfig = {
  enabled: true,
  logLevel: 'info',
  logRetentionDays: 30,
  metricsRetentionDays: 90,
  checkInterval: 60 * 1000, // 1分钟

  alerts: defaultAlertConfig,

  thresholds: {
    // 系统资源
    cpuUsage: 80,
    memoryUsage: 80,
    diskUsage: 90,

    // 链相关
    chainSyncDelay: 60 * 1000, // 1分钟
    gasPrice: {
      ethereum: 100000000000, // 100 Gwei
      base: 10000000000 // 10 Gwei
    },
    blockDelay: {
      solana: 2000, // 2秒
      ethereum: 15000, // 15秒
      base: 15000 // 15秒
    },

    // 交易相关
    transactionTimeout: 5 * 60 * 1000, // 5分钟
    queueSize: 1000,
    messageProcessingTime: 1000, // 1秒
    retryAttempts: 3,

    // API相关
    apiLatency: 1000, // 1秒
    apiErrorRate: 0.01, // 1%
    apiRateLimit: 100, // 每分钟

    // 资金相关
    balanceWarning: {
      solana: '1', // 1 SOL
      ethereum: '0.1', // 0.1 ETH
      base: '0.1' // 0.1 ETH
    },
    spendingLimit: {
      solana: '10', // 10 SOL
      ethereum: '1', // 1 ETH
      base: '1' // 1 ETH
    },

    // LLM相关
    llmLatency: 10000, // 10秒
    llmCostDaily: 100, // $100
    llmErrorRate: 0.05, // 5%

    // 安全相关
    keyRotationAge: 30 * 24 * 60 * 60 * 1000, // 30天
    suspiciousActivityThreshold: 10
  },

  targets: {
    system: {
      enabled: true,
      resources: true,
      processes: true,
      network: true
    },
    chains: {
      solana: {
        enabled: true,
        rpc: true,
        transactions: true,
        balances: true
      },
      ethereum: {
        enabled: true,
        rpc: true,
        transactions: true,
        balances: true
      },
      base: {
        enabled: true,
        rpc: true,
        transactions: true,
        balances: true
      }
    },
    services: {
      database: true,
      messageQueue: true,
      api: true,
      llm: true,
      security: true
    }
  },

  metrics: {
    enabled: true,
    port: 9090,
    path: '/metrics',
    labels: {
      environment: process.env.NODE_ENV || 'development',
      service: 'lumix'
    },
    customMetrics: []
  },

  logging: {
    console: true,
    file: true,
    database: true,
    format: 'json',
    maxFiles: 30,
    maxSize: 10 * 1024 * 1024, // 10MB
    path: './logs'
  }
};

// 导出单例实例
export const logger = Logger.getInstance();
export const metricsService = MetricsService.getInstance();
export const alertManager = AlertManager.getInstance(defaultAlertConfig);
export const systemMonitor = SystemMonitor.getInstance();

// 导出默认配置
export { defaultMonitoringConfig, defaultAlertConfig }; 