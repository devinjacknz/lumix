import { BaseError } from '@lumix/core';
import { ChainState } from '@lumix/plugin-chain-adapter';
import { GraphAnalysisResult } from '@lumix/plugin-protocol-graph';
import { ValidationResult } from '@lumix/plugin-oracle-validator';

export class DashboardError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DashboardError';
  }
}

/**
 * 仪表盘配置
 */
export interface DashboardConfig {
  // 服务器配置
  port?: number;
  host?: string;
  staticDir?: string;
  apiPrefix?: string;

  // 更新配置
  updateInterval?: number;
  maxHistorySize?: number;
  retentionPeriod?: number;

  // 缓存配置
  cacheEnabled?: boolean;
  cacheExpiration?: number;

  // 可视化配置
  theme?: 'light' | 'dark';
  defaultLayout?: WidgetLayout[];
  customCss?: string;
}

/**
 * 小部件布局
 */
export interface WidgetLayout {
  id: string;
  type: WidgetType;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  config?: Record<string, any>;
}

/**
 * 小部件类型
 */
export enum WidgetType {
  // 链状态小部件
  CHAIN_STATUS = 'chain_status',
  CHAIN_METRICS = 'chain_metrics',
  CHAIN_BLOCKS = 'chain_blocks',
  CHAIN_TXS = 'chain_transactions',

  // 协议分析小部件
  PROTOCOL_GRAPH = 'protocol_graph',
  RISK_ANALYSIS = 'risk_analysis',
  PROTOCOL_METRICS = 'protocol_metrics',
  PROTOCOL_EVENTS = 'protocol_events',

  // 预言机小部件
  ORACLE_PRICES = 'oracle_prices',
  ORACLE_ANOMALIES = 'oracle_anomalies',
  ORACLE_SOURCES = 'oracle_sources',
  ORACLE_STATS = 'oracle_stats',

  // 系统监控小部件
  SYSTEM_HEALTH = 'system_health',
  SYSTEM_LOGS = 'system_logs',
  SYSTEM_ALERTS = 'system_alerts',
  SYSTEM_RESOURCES = 'system_resources'
}

/**
 * 小部件数据
 */
export interface WidgetData {
  id: string;
  type: WidgetType;
  timestamp: number;
  data: any;
  metadata?: Record<string, any>;
}

/**
 * 链状态数据
 */
export interface ChainStatusData extends WidgetData {
  data: {
    states: Record<number, ChainState>;
    metrics: {
      totalTxs: number;
      avgBlockTime: number;
      avgGasPrice: bigint;
      tps: number;
    };
    history: {
      timestamps: number[];
      blockNumbers: number[];
      gasPrices: bigint[];
      tps: number[];
    };
  };
}

/**
 * 协议分析数据
 */
export interface ProtocolAnalysisData extends WidgetData {
  data: {
    graph: GraphAnalysisResult;
    metrics: {
      totalProtocols: number;
      totalValue: bigint;
      riskScore: number;
      activeUsers: number;
    };
    events: Array<{
      timestamp: number;
      type: string;
      protocol: string;
      data: any;
    }>;
  };
}

/**
 * 预言机数据
 */
export interface OracleData extends WidgetData {
  data: {
    validation: ValidationResult;
    metrics: {
      totalSources: number;
      validSources: number;
      anomalies: number;
      avgTrustScore: number;
    };
    history: {
      timestamps: number[];
      prices: Record<string, bigint[]>;
      anomalies: number[];
      trustScores: number[];
    };
  };
}

/**
 * 系统监控数据
 */
export interface SystemData extends WidgetData {
  data: {
    health: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      uptime: number;
      lastUpdate: number;
      components: Record<string, {
        status: string;
        message?: string;
      }>;
    };
    resources: {
      cpu: number;
      memory: number;
      disk: number;
      network: {
        rx: number;
        tx: number;
      };
    };
    alerts: Array<{
      id: string;
      severity: 'info' | 'warning' | 'error' | 'critical';
      message: string;
      timestamp: number;
      acknowledged: boolean;
    }>;
    logs: Array<{
      timestamp: number;
      level: string;
      module: string;
      message: string;
    }>;
  };
}

/**
 * 仪表盘事件
 */
export interface DashboardEvent {
  type: 'widget_update' | 'layout_change' | 'theme_change' | 'error';
  timestamp: number;
  data: any;
} 