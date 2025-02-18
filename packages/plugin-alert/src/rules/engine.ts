import { BaseError } from '@lumix/core';
import { IntentRecognizer } from '@lumix/dialog';
import { AlertRule, AlertContext, AlertResult, AlertSeverity } from '../types';

export class AlertRuleError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AlertRuleError';
  }
}

export interface RuleEvaluationResult {
  matched: boolean;
  severity: AlertSeverity;
  confidence: number;
  metadata?: Record<string, any>;
}

export class AlertRuleEngine {
  private rules: Map<string, AlertRule>;
  private intentRecognizer: IntentRecognizer;

  constructor() {
    this.rules = new Map();
    this.intentRecognizer = new IntentRecognizer();
    this.initializeDefaultRules();
  }

  /**
   * 添加规则
   */
  addRule(rule: AlertRule): void {
    this.validateRule(rule);
    this.rules.set(rule.id, rule);

    // 添加意图识别训练数据
    if (rule.examples) {
      this.intentRecognizer.addExamples(rule.id, rule.examples);
    }
  }

  /**
   * 移除规则
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.intentRecognizer.removeIntent(ruleId);
  }

  /**
   * 评估上下文
   */
  async evaluateContext(context: AlertContext): Promise<AlertResult[]> {
    const results: AlertResult[] = [];

    // 识别意图
    const intents = await this.intentRecognizer.recognize(context.message);

    // 评估匹配的规则
    for (const intent of intents) {
      const rule = this.rules.get(intent.intent);
      if (!rule) continue;

      try {
        // 评估规则条件
        const result = await this.evaluateRule(rule, context);
        if (result.matched) {
          results.push({
            id: this.generateAlertId(),
            ruleId: rule.id,
            severity: result.severity,
            message: this.formatMessage(rule.template, {
              ...context,
              ...result.metadata
            }),
            timestamp: Date.now(),
            context,
            metadata: {
              confidence: result.confidence,
              ...result.metadata
            }
          });
        }
      } catch (error) {
        console.error(`Failed to evaluate rule ${rule.id}:`, error);
      }
    }

    return results;
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
   * 验证规则
   */
  private validateRule(rule: AlertRule): void {
    if (!rule.id || !rule.name || !rule.conditions || !rule.template) {
      throw new AlertRuleError('Invalid rule: missing required fields');
    }

    if (!Object.values(AlertSeverity).includes(rule.severity)) {
      throw new AlertRuleError(`Invalid severity: ${rule.severity}`);
    }

    if (rule.examples && rule.examples.length === 0) {
      throw new AlertRuleError('Examples array cannot be empty');
    }
  }

  /**
   * 评估规则
   */
  private async evaluateRule(
    rule: AlertRule,
    context: AlertContext
  ): Promise<RuleEvaluationResult> {
    let matchedCount = 0;
    const metadata: Record<string, any> = {};

    // 评估所有条件
    for (const condition of rule.conditions) {
      try {
        const result = await this.evaluateCondition(condition, context);
        if (result.matched) {
          matchedCount++;
          Object.assign(metadata, result.metadata);
        }
      } catch (error) {
        console.error(`Failed to evaluate condition:`, error);
      }
    }

    // 计算匹配置信度
    const confidence = matchedCount / rule.conditions.length;

    // 确定是否触发规则
    const matched = confidence >= (rule.threshold || 0.8);

    // 确定告警严重程度
    const severity = this.calculateSeverity(rule, confidence);

    return {
      matched,
      severity,
      confidence,
      metadata
    };
  }

  /**
   * 评估条件
   */
  private async evaluateCondition(
    condition: AlertRule['conditions'][0],
    context: AlertContext
  ): Promise<{ matched: boolean; metadata?: Record<string, any> }> {
    const { type, operator, value, params } = condition;

    // 获取上下文值
    const contextValue = this.getContextValue(type, context);
    if (contextValue === undefined) {
      return { matched: false };
    }

    // 根据操作符评估
    switch (operator) {
      case 'eq':
        return {
          matched: contextValue === value,
          metadata: { [type]: contextValue }
        };
      case 'gt':
        return {
          matched: contextValue > value,
          metadata: { [type]: contextValue }
        };
      case 'lt':
        return {
          matched: contextValue < value,
          metadata: { [type]: contextValue }
        };
      case 'contains':
        return {
          matched: Array.isArray(contextValue) ?
            contextValue.includes(value) :
            String(contextValue).includes(String(value)),
          metadata: { [type]: contextValue }
        };
      case 'regex':
        return {
          matched: new RegExp(String(value)).test(String(contextValue)),
          metadata: { [type]: contextValue }
        };
      case 'custom':
        if (typeof params?.validator === 'function') {
          const result = await params.validator(contextValue, value);
          return {
            matched: result.matched,
            metadata: { [type]: contextValue, ...result.metadata }
          };
        }
        return { matched: false };
      default:
        return { matched: false };
    }
  }

  /**
   * 获取上下文值
   */
  private getContextValue(type: string, context: AlertContext): any {
    const parts = type.split('.');
    let value: any = context;
    
    for (const part of parts) {
      if (value === undefined || value === null) return undefined;
      value = value[part];
    }

    return value;
  }

  /**
   * 计算告警严重程度
   */
  private calculateSeverity(
    rule: AlertRule,
    confidence: number
  ): AlertSeverity {
    if (confidence >= 0.9) {
      return rule.severity;
    } else if (confidence >= 0.7) {
      return this.lowerSeverity(rule.severity);
    } else {
      return this.lowestSeverity(rule.severity);
    }
  }

  /**
   * 降低严重程度
   */
  private lowerSeverity(severity: AlertSeverity): AlertSeverity {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return AlertSeverity.ERROR;
      case AlertSeverity.ERROR:
        return AlertSeverity.WARNING;
      case AlertSeverity.WARNING:
        return AlertSeverity.INFO;
      default:
        return AlertSeverity.INFO;
    }
  }

  /**
   * 获取最低严重程度
   */
  private lowestSeverity(severity: AlertSeverity): AlertSeverity {
    return severity === AlertSeverity.CRITICAL ?
      AlertSeverity.WARNING :
      AlertSeverity.INFO;
  }

  /**
   * 格式化消息
   */
  private formatMessage(
    template: string,
    data: Record<string, any>
  ): string {
    return template.replace(/\${(\w+)}/g, (_, key) => {
      const value = this.getContextValue(key, data);
      return value !== undefined ? String(value) : '';
    });
  }

  /**
   * 生成告警 ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  /**
   * 初始化默认规则
   */
  private initializeDefaultRules(): void {
    // 价格异常规则
    this.addRule({
      id: 'price_anomaly',
      name: '价格异常',
      description: '检测价格异常波动',
      severity: AlertSeverity.WARNING,
      conditions: [
        {
          type: 'price.change',
          operator: 'gt',
          value: 0.1 // 10% 波动
        },
        {
          type: 'volume.change',
          operator: 'gt',
          value: 0.5 // 50% 波动
        }
      ],
      template: '${symbol} 价格异常波动: ${price.change}%',
      examples: [
        '价格波动异常',
        '价格剧烈变化',
        '价格突然上涨',
        '价格大幅下跌'
      ]
    });

    // Gas 费用告警
    this.addRule({
      id: 'high_gas',
      name: '高 Gas 费用',
      description: '检测 Gas 费用异常',
      severity: AlertSeverity.INFO,
      conditions: [
        {
          type: 'gas.price',
          operator: 'gt',
          value: 100 // 100 Gwei
        }
      ],
      template: 'Gas 费用过高: ${gas.price} Gwei',
      examples: [
        'gas 费用高',
        'gas 价格上涨',
        '网络拥堵'
      ]
    });

    // 系统资源告警
    this.addRule({
      id: 'system_resource',
      name: '系统资源告警',
      description: '检测系统资源使用异常',
      severity: AlertSeverity.ERROR,
      conditions: [
        {
          type: 'system.cpu',
          operator: 'gt',
          value: 90 // 90% CPU 使用率
        },
        {
          type: 'system.memory',
          operator: 'gt',
          value: 90 // 90% 内存使用率
        }
      ],
      template: '系统资源告警: CPU ${system.cpu}%, 内存 ${system.memory}%',
      examples: [
        '系统负载高',
        'CPU 使用率高',
        '内存不足',
        '系统性能下降'
      ]
    });
  }
} 