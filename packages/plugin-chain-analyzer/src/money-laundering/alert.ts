import {
  MoneyLaunderingAlert,
  FlowPattern,
  AlertConfig
} from './types';
import { AddressProfile } from '../profile/types';

export class AlertGenerator {
  private config: Required<AlertConfig>;
  private alerts: Map<string, MoneyLaunderingAlert>;
  private lastCleanup: number;

  constructor(config: AlertConfig) {
    this.config = {
      minSeverityScore: config.minSeverityScore,
      maxAlertsPerAddress: config.maxAlertsPerAddress,
      deduplicationWindow: config.deduplicationWindow,
      notificationThreshold: config.notificationThreshold || {
        low: 0.7,
        medium: 0.8,
        high: 0.9,
        critical: 0.95
      }
    };
    this.alerts = new Map();
    this.lastCleanup = Date.now();
  }

  /**
   * 生成洗钱警报
   */
  async generateAlerts(
    patterns: FlowPattern[],
    profiles: AddressProfile[]
  ): Promise<MoneyLaunderingAlert[]> {
    // 清理过期警报
    this.cleanupExpiredAlerts();

    const newAlerts: MoneyLaunderingAlert[] = [];

    for (const pattern of patterns) {
      // 计算警报严重程度
      const severity = this.calculateSeverity(pattern);
      const riskScore = this.calculateRiskScore(pattern, profiles);

      // 检查是否达到通知阈值
      if (riskScore < this.config.notificationThreshold[severity]) {
        continue;
      }

      // 检查是否超过每个地址的最大警报数
      const addressAlertCounts = new Map<string, number>();
      for (const address of pattern.participants) {
        const count = this.countAddressAlerts(address);
        if (count >= this.config.maxAlertsPerAddress) {
          continue;
        }
        addressAlertCounts.set(address, count);
      }

      // 生成警报
      const alert = await this.createAlert(
        pattern,
        profiles,
        severity,
        riskScore
      );

      // 检查重复
      if (!this.isDuplicate(alert)) {
        newAlerts.push(alert);
        this.alerts.set(alert.id, alert);
      }
    }

    return newAlerts;
  }

  /**
   * 创建警报
   */
  private async createAlert(
    pattern: FlowPattern,
    profiles: AddressProfile[],
    severity: MoneyLaunderingAlert['severity'],
    riskScore: number
  ): Promise<MoneyLaunderingAlert> {
    const alert: MoneyLaunderingAlert = {
      id: this.generateAlertId(),
      timestamp: Date.now(),
      severity,
      pattern,
      riskScore,
      sourceAddresses: pattern.participants.map(address => {
        const profile = profiles.find(p => p.address === address);
        return {
          address,
          profile,
          role: this.determineAddressRole(address, pattern)
        };
      }),
      description: this.generateDescription(pattern, severity),
      metadata: {
        detectionTime: Date.now(),
        patternType: pattern.type,
        flowCount: pattern.flows.length,
        totalValue: pattern.totalValue.toString(),
        timeRange: {
          start: pattern.startTime,
          end: pattern.endTime
        }
      }
    };

    return alert;
  }

  /**
   * 计算警报严重程度
   */
  private calculateSeverity(
    pattern: FlowPattern
  ): MoneyLaunderingAlert['severity'] {
    const score = pattern.score;

    if (score >= 0.95) {
      return 'critical';
    } else if (score >= 0.9) {
      return 'high';
    } else if (score >= 0.8) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * 计算风险评分
   */
  private calculateRiskScore(
    pattern: FlowPattern,
    profiles: AddressProfile[]
  ): number {
    // 基础分数来自模式得分
    let score = pattern.score;

    // 考虑参与地址的风险评分
    const addressRiskScores = pattern.participants
      .map(addr => {
        const profile = profiles.find(p => p.address === addr);
        return profile ? profile.riskScore : 0;
      })
      .filter(score => score > 0);

    if (addressRiskScores.length > 0) {
      const avgAddressRisk = addressRiskScores.reduce((a, b) => a + b, 0) / addressRiskScores.length;
      score = (score + avgAddressRisk / 100) / 2;
    }

    // 考虑交易金额
    const valueWeight = this.calculateValueWeight(pattern.totalValue);
    score = score * (1 + valueWeight);

    // 考虑时间跨度
    const timeWeight = this.calculateTimeWeight(
      pattern.endTime - pattern.startTime
    );
    score = score * (1 + timeWeight);

    return Math.min(score, 1);
  }

  /**
   * 检查是否为重复警报
   */
  private isDuplicate(alert: MoneyLaunderingAlert): boolean {
    const now = Date.now();
    
    for (const existingAlert of this.alerts.values()) {
      // 检查时间窗口
      if (now - existingAlert.timestamp > this.config.deduplicationWindow) {
        continue;
      }

      // 检查模式类型
      if (existingAlert.pattern.type !== alert.pattern.type) {
        continue;
      }

      // 检查参与地址
      const existingAddresses = new Set(
        existingAlert.sourceAddresses.map(a => a.address)
      );
      const newAddresses = new Set(
        alert.sourceAddresses.map(a => a.address)
      );

      const intersection = new Set(
        [...existingAddresses].filter(x => newAddresses.has(x))
      );

      // 如果有超过 50% 的地址重叠，认为是重复警报
      if (intersection.size >= Math.min(existingAddresses.size, newAddresses.size) * 0.5) {
        return true;
      }
    }

    return false;
  }

  /**
   * 清理过期警报
   */
  private cleanupExpiredAlerts(): void {
    const now = Date.now();
    if (now - this.lastCleanup < this.config.deduplicationWindow) {
      return;
    }

    for (const [id, alert] of this.alerts.entries()) {
      if (now - alert.timestamp > this.config.deduplicationWindow) {
        this.alerts.delete(id);
      }
    }

    this.lastCleanup = now;
  }

  /**
   * 计算地址的警报数量
   */
  private countAddressAlerts(address: string): number {
    let count = 0;
    const now = Date.now();

    for (const alert of this.alerts.values()) {
      if (
        now - alert.timestamp <= this.config.deduplicationWindow &&
        alert.sourceAddresses.some(a => a.address === address)
      ) {
        count++;
      }
    }

    return count;
  }

  /**
   * 确定地址角色
   */
  private determineAddressRole(
    address: string,
    pattern: FlowPattern
  ): MoneyLaunderingAlert['sourceAddresses'][0]['role'] {
    const inFlows = pattern.flows.filter(f => f.to === address);
    const outFlows = pattern.flows.filter(f => f.from === address);

    if (inFlows.length === 0 && outFlows.length > 0) {
      return 'source';
    } else if (inFlows.length > 0 && outFlows.length === 0) {
      return 'destination';
    } else {
      return 'intermediary';
    }
  }

  /**
   * 生成警报描述
   */
  private generateDescription(
    pattern: FlowPattern,
    severity: MoneyLaunderingAlert['severity']
  ): string {
    const typeMap = {
      layering: '分层',
      structuring: '结构化',
      mixing: '混合',
      smurfing: '分散',
      cycling: '循环'
    };

    const severityMap = {
      low: '低风险',
      medium: '中风险',
      high: '高风险',
      critical: '严重风险'
    };

    return `检测到${severityMap[severity]}${typeMap[pattern.type]}交易模式，涉及 ${pattern.participants.length} 个地址，总价值 ${pattern.totalValue.toString()} Wei`;
  }

  /**
   * 生成警报 ID
   */
  private generateAlertId(): string {
    return `ml-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 计算金额权重
   */
  private calculateValueWeight(value: bigint): number {
    // TODO: 实现金额权重计算逻辑
    return 0;
  }

  /**
   * 计算时间权重
   */
  private calculateTimeWeight(duration: number): number {
    // TODO: 实现时间权重计算逻辑
    return 0;
  }
} 