import { ChainType } from '../config/types';
import { Logger } from './logger';
import { messagingMiddleware } from '../messaging';
import { EventType } from '../messaging/types';

// 创建 logger 实例
const logger = Logger.getInstance();

// 告警级别
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// 告警类型
export enum AlertType {
  // 系统告警
  SYSTEM_CPU_HIGH = 'system:cpu_high',
  SYSTEM_MEMORY_HIGH = 'system:memory_high',
  SYSTEM_DISK_HIGH = 'system:disk_high',
  SYSTEM_ERROR = 'system:error',
  
  // 链相关告警
  CHAIN_SYNC_DELAY = 'chain:sync_delay',
  CHAIN_RPC_ERROR = 'chain:rpc_error',
  CHAIN_GAS_HIGH = 'chain:gas_high',
  CHAIN_TRANSACTION_FAILED = 'chain:transaction_failed',
  
  // 交易相关告警
  TRANSACTION_TIMEOUT = 'transaction:timeout',
  TRANSACTION_ERROR = 'transaction:error',
  TRANSACTION_QUEUE_FULL = 'transaction:queue_full',
  TRANSACTION_RETRY_EXCEEDED = 'transaction:retry_exceeded',
  
  // 资金相关告警
  BALANCE_LOW = 'balance:low',
  BALANCE_INSUFFICIENT = 'balance:insufficient',
  SPENDING_LIMIT_EXCEEDED = 'balance:spending_limit_exceeded',
  
  // API相关告警
  API_ERROR = 'api:error',
  API_RATE_LIMIT = 'api:rate_limit',
  API_LATENCY_HIGH = 'api:latency_high',
  
  // LLM相关告警
  LLM_ERROR = 'llm:error',
  LLM_COST_HIGH = 'llm:cost_high',
  LLM_LATENCY_HIGH = 'llm:latency_high',
  
  // 安全相关告警
  SECURITY_KEY_EXPIRED = 'security:key_expired',
  SECURITY_INVALID_ACCESS = 'security:invalid_access',
  SECURITY_SUSPICIOUS_ACTIVITY = 'security:suspicious_activity'
}

// 告警接口
export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
  source?: string;
  chain?: ChainType;
  metadata?: Record<string, any>;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  actions?: Array<{
    type: string;
    description: string;
    executed: boolean;
    executedAt?: Date;
    result?: any;
  }>;
}

// 告警配置
export interface AlertConfig {
  enabled: boolean;
  minSeverity: AlertSeverity;
  thresholds: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    chainSyncDelay: number;
    transactionTimeout: number;
    balanceWarning: number;
    apiLatency: number;
    llmCostDaily: number;
  };
  notifications: {
    email?: string[];
    webhook?: string[];
    slack?: string;
    telegram?: string;
  };
}

// 告警管理器
export class AlertManager {
  private static instance: AlertManager;
  private config: AlertConfig;
  private alerts: Map<string, Alert> = new Map();

  private constructor(config: AlertConfig) {
    this.config = config;
  }

  public static getInstance(config?: AlertConfig): AlertManager {
    if (!AlertManager.instance) {
      if (!config) {
        throw new Error('Configuration required for alert manager initialization');
      }
      AlertManager.instance = new AlertManager(config);
    }
    return AlertManager.instance;
  }

  // 创建告警
  public async createAlert(
    type: AlertType,
    severity: AlertSeverity,
    message: string,
    options?: {
      source?: string;
      chain?: ChainType;
      metadata?: Record<string, any>;
    }
  ): Promise<Alert> {
    // 检查是否启用告警
    if (!this.config.enabled) {
      return null;
    }

    // 检查告警级别
    if (this.getSeverityLevel(severity) < this.getSeverityLevel(this.config.minSeverity)) {
      return null;
    }

    // 创建告警
    const alert: Alert = {
      id: this.generateAlertId(),
      type,
      severity,
      message,
      timestamp: new Date(),
      source: options?.source,
      chain: options?.chain,
      metadata: options?.metadata,
      acknowledged: false
    };

    // 保存告警
    this.alerts.set(alert.id, alert);

    // 发送告警通知
    await this.sendAlertNotifications(alert);

    // 记录日志
    logger.warn('Alert', `New alert: ${message}`, {
      alertId: alert.id,
      type,
      severity,
      ...options
    });

    // 发出事件
    await messagingMiddleware.emitEvent({
      type: EventType.ALERT_TRIGGERED,
      timestamp: new Date(),
      data: alert
    });

    return alert;
  }

  // 确认告警
  public async acknowledgeAlert(
    alertId: string,
    acknowledgedBy: string
  ): Promise<Alert> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;

    logger.info('Alert', `Alert acknowledged: ${alertId}`, {
      acknowledgedBy
    });

    return alert;
  }

  // 解决告警
  public async resolveAlert(
    alertId: string,
    resolvedBy: string
  ): Promise<Alert> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.resolvedAt = new Date();
    alert.resolvedBy = resolvedBy;

    logger.info('Alert', `Alert resolved: ${alertId}`, {
      resolvedBy
    });

    return alert;
  }

  // 获取活跃告警
  public getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.resolvedAt)
      .sort((a, b) => {
        // 按严重程度和时间排序
        const severityDiff = this.getSeverityLevel(b.severity) - this.getSeverityLevel(a.severity);
        if (severityDiff !== 0) return severityDiff;
        return b.timestamp.getTime() - a.timestamp.getTime();
      });
  }

  // 获取告警历史
  public getAlertHistory(options?: {
    startTime?: Date;
    endTime?: Date;
    type?: AlertType;
    severity?: AlertSeverity;
    chain?: ChainType;
    resolved?: boolean;
  }): Alert[] {
    let alerts = Array.from(this.alerts.values());

    // 应用过滤条件
    if (options?.startTime) {
      alerts = alerts.filter(a => a.timestamp >= options.startTime);
    }
    if (options?.endTime) {
      alerts = alerts.filter(a => a.timestamp <= options.endTime);
    }
    if (options?.type) {
      alerts = alerts.filter(a => a.type === options.type);
    }
    if (options?.severity) {
      alerts = alerts.filter(a => a.severity === options.severity);
    }
    if (options?.chain) {
      alerts = alerts.filter(a => a.chain === options.chain);
    }
    if (options?.resolved !== undefined) {
      alerts = alerts.filter(a => Boolean(a.resolvedAt) === options.resolved);
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // 添加告警动作
  public async addAlertAction(
    alertId: string,
    action: {
      type: string;
      description: string;
    }
  ): Promise<Alert> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    if (!alert.actions) {
      alert.actions = [];
    }

    alert.actions.push({
      ...action,
      executed: false
    });

    return alert;
  }

  // 执行告警动作
  public async executeAlertAction(
    alertId: string,
    actionType: string,
    result?: any
  ): Promise<Alert> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    const action = alert.actions?.find(a => a.type === actionType && !a.executed);
    if (!action) {
      throw new Error(`Action not found: ${actionType}`);
    }

    action.executed = true;
    action.executedAt = new Date();
    action.result = result;

    return alert;
  }

  // 清理已解决的告警
  public async cleanupResolvedAlerts(maxAge: number): Promise<void> {
    const cutoffTime = new Date(Date.now() - maxAge);
    
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.resolvedAt && alert.resolvedAt < cutoffTime) {
        this.alerts.delete(id);
      }
    }
  }

  // 辅助方法
  private generateAlertId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getSeverityLevel(severity: AlertSeverity): number {
    const levels = {
      [AlertSeverity.INFO]: 0,
      [AlertSeverity.WARNING]: 1,
      [AlertSeverity.ERROR]: 2,
      [AlertSeverity.CRITICAL]: 3
    };
    return levels[severity];
  }

  private async sendAlertNotifications(alert: Alert): Promise<void> {
    const notifications = this.config.notifications;

    // 发送邮件通知
    if (notifications.email?.length > 0) {
      // TODO: 实现邮件通知
    }

    // 发送Webhook通知
    if (notifications.webhook?.length > 0) {
      // TODO: 实现Webhook通知
    }

    // 发送Slack通知
    if (notifications.slack) {
      // TODO: 实现Slack通知
    }

    // 发送Telegram通知
    if (notifications.telegram) {
      // TODO: 实现Telegram通知
    }
  }
} 