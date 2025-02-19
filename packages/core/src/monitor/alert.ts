import { EventEmitter } from 'events';
import { BaseError } from '../types/errors';
import { RealTimeMonitor, MonitorDataPoint } from './realtime';

/**
 * 告警错误
 */
export class AlertError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AlertError';
  }
}

/**
 * 告警级别
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
  id: string;
  name: string;
  description?: string;
  severity: AlertSeverity;
  condition: {
    metric: string;
    operator: 'gt' | 'lt' | 'eq' | 'ne' | 'gte' | 'lte';
    value: number;
    duration?: number;
  };
  throttle?: {
    count: number;
    window: number;
  };
  enabled: boolean;
  metadata?: Record<string, any>;
}

/**
 * 告警
 */
export interface Alert {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * 告警配置
 */
export interface AlertConfig {
  // 基础配置
  enabled?: boolean;
  checkInterval?: number;
  rules?: AlertRule[];

  // 通知配置
  notificationChannels?: Array<{
    type: 'email' | 'slack' | 'webhook';
    config: Record<string, any>;
  }>;
  notificationThrottling?: {
    maxNotifications?: number;
    window?: number;
  };

  // 存储配置
  maxAlerts?: number;
  retentionPeriod?: number;
}

/**
 * 告警管理器
 */
export class AlertManager extends EventEmitter {
  private config: Required<AlertConfig>;
  private monitor: RealTimeMonitor;
  private rules: Map<string, AlertRule>;
  private alerts: Alert[];
  private activeAlerts: Set<string>;
  private notificationCounts: Map<string, Array<number>>;
  private checkInterval: NodeJS.Timer;

  constructor(
    monitor: RealTimeMonitor,
    config: AlertConfig = {}
  ) {
    super();
    this.monitor = monitor;
    this.rules = new Map();
    this.alerts = [];
    this.activeAlerts = new Set();
    this.notificationCounts = new Map();

    this.config = {
      enabled: config.enabled ?? true,
      checkInterval: config.checkInterval || 1000, // 1秒
      rules: config.rules || [],
      notificationChannels: config.notificationChannels || [],
      notificationThrottling: {
        maxNotifications: config.notificationThrottling?.maxNotifications || 10,
        window: config.notificationThrottling?.window || 60000 // 1分钟
      },
      maxAlerts: config.maxAlerts || 1000,
      retentionPeriod: config.retentionPeriod || 24 * 60 * 60 * 1000 // 24小时
    };

    // 初始化规则
    for (const rule of this.config.rules) {
      this.addRule(rule);
    }

    if (this.config.enabled) {
      this.start();
    }
  }

  /**
   * 添加规则
   */
  addRule(rule: AlertRule): void {
    this.validateRule(rule);
    this.rules.set(rule.id, rule);
    this.emit('ruleAdded', rule);
  }

  /**
   * 更新规则
   */
  updateRule(ruleId: string, updates: Partial<AlertRule>): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new AlertError(`Rule ${ruleId} not found`);
    }

    const updatedRule = { ...rule, ...updates };
    this.validateRule(updatedRule);
    this.rules.set(ruleId, updatedRule);
    this.emit('ruleUpdated', updatedRule);
  }

  /**
   * 删除规则
   */
  deleteRule(ruleId: string): void {
    if (this.rules.delete(ruleId)) {
      this.emit('ruleDeleted', ruleId);
    }
  }

  /**
   * 验证规则
   */
  private validateRule(rule: AlertRule): void {
    if (!rule.id) {
      throw new AlertError('Rule ID is required');
    }

    if (!rule.name) {
      throw new AlertError('Rule name is required');
    }

    if (!rule.severity) {
      throw new AlertError('Rule severity is required');
    }

    if (!rule.condition) {
      throw new AlertError('Rule condition is required');
    }

    if (!rule.condition.metric) {
      throw new AlertError('Rule condition metric is required');
    }

    if (!rule.condition.operator) {
      throw new AlertError('Rule condition operator is required');
    }

    if (typeof rule.condition.value !== 'number') {
      throw new AlertError('Rule condition value must be a number');
    }
  }

  /**
   * 启动告警检查
   */
  private start(): void {
    this.checkInterval = setInterval(() => {
      this.checkRules();
    }, this.config.checkInterval);

    // 监听监控数据
    this.monitor.on('data', (data: MonitorDataPoint) => {
      this.processDataPoint(data);
    });
  }

  /**
   * 处理数据点
   */
  private processDataPoint(data: MonitorDataPoint): void {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      try {
        const value = this.getMetricValue(data, rule.condition.metric);
        if (this.checkCondition(rule.condition, value)) {
          this.createAlert(rule, value);
        } else {
          this.resolveAlert(rule.id);
        }
      } catch (error) {
        this.emit('error', {
          rule,
          error
        });
      }
    }
  }

  /**
   * 获取指标值
   */
  private getMetricValue(data: MonitorDataPoint, metric: string): number {
    const parts = metric.split('.');
    let value: any = data;

    for (const part of parts) {
      if (value === undefined) {
        throw new AlertError(`Metric ${metric} not found`);
      }
      value = value[part];
    }

    if (typeof value !== 'number') {
      throw new AlertError(`Metric ${metric} is not a number`);
    }

    return value;
  }

  /**
   * 检查条件
   */
  private checkCondition(
    condition: AlertRule['condition'],
    value: number
  ): boolean {
    switch (condition.operator) {
      case 'gt':
        return value > condition.value;
      case 'lt':
        return value < condition.value;
      case 'eq':
        return value === condition.value;
      case 'ne':
        return value !== condition.value;
      case 'gte':
        return value >= condition.value;
      case 'lte':
        return value <= condition.value;
      default:
        throw new AlertError(`Unknown operator: ${condition.operator}`);
    }
  }

  /**
   * 创建告警
   */
  private createAlert(rule: AlertRule, value: number): void {
    // 检查是否已经存在活动告警
    if (this.activeAlerts.has(rule.id)) {
      return;
    }

    // 检查节流
    if (rule.throttle && !this.checkThrottle(rule)) {
      return;
    }

    const alert: Alert = {
      id: this.generateAlertId(),
      ruleId: rule.id,
      severity: rule.severity,
      message: this.formatAlertMessage(rule, value),
      value,
      threshold: rule.condition.value,
      timestamp: Date.now(),
      metadata: rule.metadata
    };

    this.alerts.push(alert);
    this.activeAlerts.add(rule.id);
    this.emit('alertCreated', alert);

    // 发送通知
    this.sendNotifications(alert);

    // 限制告警数量
    if (this.alerts.length > this.config.maxAlerts) {
      this.alerts.shift();
    }
  }

  /**
   * 解决告警
   */
  private resolveAlert(ruleId: string): void {
    if (this.activeAlerts.has(ruleId)) {
      this.activeAlerts.delete(ruleId);
      this.emit('alertResolved', ruleId);
    }
  }

  /**
   * 检查节流
   */
  private checkThrottle(rule: AlertRule): boolean {
    if (!rule.throttle) return true;

    const counts = this.notificationCounts.get(rule.id) || [];
    const now = Date.now();
    const windowStart = now - rule.throttle.window;

    // 清理旧的通知记录
    const recentCounts = counts.filter(t => t > windowStart);
    this.notificationCounts.set(rule.id, recentCounts);

    // 检查是否超过限制
    return recentCounts.length < rule.throttle.count;
  }

  /**
   * 发送通知
   */
  private async sendNotifications(alert: Alert): Promise<void> {
    for (const channel of this.config.notificationChannels) {
      try {
        await this.sendNotification(channel, alert);
        
        // 更新通知计数
        const counts = this.notificationCounts.get(alert.ruleId) || [];
        counts.push(Date.now());
        this.notificationCounts.set(alert.ruleId, counts);
      } catch (error) {
        this.emit('notificationError', {
          alert,
          channel,
          error
        });
      }
    }
  }

  /**
   * 发送单个通知
   */
  private async sendNotification(
    channel: AlertConfig['notificationChannels'][0],
    alert: Alert
  ): Promise<void> {
    // 这里应该实现具体的通知逻辑
    this.emit('notificationSent', {
      alert,
      channel
    });
  }

  /**
   * 格式化告警消息
   */
  private formatAlertMessage(rule: AlertRule, value: number): string {
    return `${rule.name}: ${rule.condition.metric} is ${value} ` +
      `${rule.condition.operator} ${rule.condition.value}`;
  }

  /**
   * 生成告警 ID
   */
  private generateAlertId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * 检查规则
   */
  private checkRules(): void {
    // 清理过期告警
    this.cleanupAlerts();

    // 发出规则检查事件
    this.emit('rulesChecked', {
      activeRules: this.rules.size,
      activeAlerts: this.activeAlerts.size
    });
  }

  /**
   * 清理告警
   */
  private cleanupAlerts(): void {
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.alerts = this.alerts.filter(a => a.timestamp > cutoff);
  }

  /**
   * 获取告警
   */
  getAlerts(
    startTime?: number,
    endTime?: number,
    severity?: AlertSeverity
  ): Alert[] {
    let alerts = this.alerts;

    if (startTime) {
      alerts = alerts.filter(a => a.timestamp >= startTime);
    }

    if (endTime) {
      alerts = alerts.filter(a => a.timestamp <= endTime);
    }

    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }

    return alerts;
  }

  /**
   * 获取活动告警
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(a => this.activeAlerts.has(a.ruleId));
  }

  /**
   * 获取规则
   */
  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 停止告警管理器
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.emit('stopped');
  }
} 