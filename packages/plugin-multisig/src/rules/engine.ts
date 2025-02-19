import { BaseError } from '@lumix/core';
import { MerkleTree } from 'merkletreejs';
import { keccak256 } from '@ethereumjs/util';

export class RuleEngineError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RuleEngineError';
  }
}

export interface Condition {
  type: 'amount' | 'address' | 'time' | 'contract' | 'custom';
  operator: 'eq' | 'gt' | 'lt' | 'in' | 'contains' | 'matches';
  value: any;
  context?: Record<string, any>;
}

export interface Rule {
  id: string;
  name: string;
  description?: string;
  conditions: Condition[];
  requiredApprovals: number;
  approvers: string[];
  timeoutMinutes?: number;
  priority: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ApprovalContext {
  transactionHash?: string;
  sender: string;
  recipient?: string;
  amount?: bigint;
  contractAddress?: string;
  methodId?: string;
  parameters?: any[];
  timestamp: number;
  chainId: number;
  metadata?: Record<string, any>;
}

export interface RuleMatch {
  rule: Rule;
  matchedConditions: Condition[];
  score: number;
  requiredApprovals: number;
  remainingApprovals: number;
  deadline?: number;
}

export interface RuleEngineConfig {
  rules?: Rule[];
  defaultRequiredApprovals?: number;
  defaultTimeout?: number;
  enableCaching?: boolean;
  maxConcurrentEvaluations?: number;
}

export class RuleEngine {
  private rules: Map<string, Rule>;
  private ruleTree: MerkleTree;
  private config: Required<RuleEngineConfig>;

  constructor(config: RuleEngineConfig = {}) {
    this.rules = new Map();
    this.config = {
      rules: config.rules || [],
      defaultRequiredApprovals: config.defaultRequiredApprovals || 2,
      defaultTimeout: config.defaultTimeout || 60, // 60 minutes
      enableCaching: config.enableCaching ?? true,
      maxConcurrentEvaluations: config.maxConcurrentEvaluations || 10
    };

    // 初始化规则
    for (const rule of this.config.rules) {
      this.addRule(rule);
    }

    // 构建规则 Merkle 树
    this.rebuildRuleTree();
  }

  /**
   * 添加新规则
   */
  addRule(rule: Rule): void {
    if (this.rules.has(rule.id)) {
      throw new RuleEngineError(`Rule with id ${rule.id} already exists`);
    }

    // 验证规则
    this.validateRule(rule);

    // 设置默认值
    const normalizedRule: Rule = {
      ...rule,
      requiredApprovals: rule.requiredApprovals || this.config.defaultRequiredApprovals,
      timeoutMinutes: rule.timeoutMinutes || this.config.defaultTimeout
    };

    this.rules.set(rule.id, normalizedRule);
    this.rebuildRuleTree();
  }

  /**
   * 更新现有规则
   */
  updateRule(ruleId: string, updates: Partial<Rule>): void {
    const existingRule = this.rules.get(ruleId);
    if (!existingRule) {
      throw new RuleEngineError(`Rule ${ruleId} not found`);
    }

    const updatedRule = { ...existingRule, ...updates };
    this.validateRule(updatedRule);
    this.rules.set(ruleId, updatedRule);
    this.rebuildRuleTree();
  }

  /**
   * 删除规则
   */
  deleteRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      this.rebuildRuleTree();
    }
    return deleted;
  }

  /**
   * 评估审批上下文并返回匹配的规则
   */
  async evaluateContext(context: ApprovalContext): Promise<RuleMatch[]> {
    const matches: RuleMatch[] = [];

    for (const rule of this.rules.values()) {
      const matchedConditions: Condition[] = [];
      let score = 0;

      // 评估每个条件
      for (const condition of rule.conditions) {
        if (await this.evaluateCondition(condition, context)) {
          matchedConditions.push(condition);
          score += 1;
        }
      }

      // 如果所有条件都匹配
      if (matchedConditions.length === rule.conditions.length) {
        matches.push({
          rule,
          matchedConditions,
          score,
          requiredApprovals: rule.requiredApprovals,
          remainingApprovals: rule.requiredApprovals,
          deadline: context.timestamp + (rule.timeoutMinutes || this.config.defaultTimeout) * 60 * 1000
        });
      }
    }

    // 按优先级和匹配分数排序
    return matches.sort((a, b) => 
      b.rule.priority - a.rule.priority || b.score - a.score
    );
  }

  /**
   * 验证规则集完整性
   */
  verifyRuleIntegrity(): boolean {
    const currentRoot = this.ruleTree.getRoot();
    const rebuiltTree = this.buildRuleTree(Array.from(this.rules.values()));
    return currentRoot.equals(rebuiltTree.getRoot());
  }

  /**
   * 获取规则
   */
  getRule(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): Rule[] {
    return Array.from(this.rules.values());
  }

  private validateRule(rule: Rule): void {
    if (!rule.id || !rule.name) {
      throw new RuleEngineError('Rule must have id and name');
    }

    if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
      throw new RuleEngineError('Rule must have at least one condition');
    }

    if (!Array.isArray(rule.approvers) || rule.approvers.length === 0) {
      throw new RuleEngineError('Rule must have at least one approver');
    }

    if (rule.requiredApprovals > rule.approvers.length) {
      throw new RuleEngineError('Required approvals cannot exceed number of approvers');
    }

    // 验证每个条件
    for (const condition of rule.conditions) {
      this.validateCondition(condition);
    }
  }

  private validateCondition(condition: Condition): void {
    const validTypes = ['amount', 'address', 'time', 'contract', 'custom'];
    const validOperators = ['eq', 'gt', 'lt', 'in', 'contains', 'matches'];

    if (!validTypes.includes(condition.type)) {
      throw new RuleEngineError(`Invalid condition type: ${condition.type}`);
    }

    if (!validOperators.includes(condition.operator)) {
      throw new RuleEngineError(`Invalid condition operator: ${condition.operator}`);
    }

    if (condition.value === undefined || condition.value === null) {
      throw new RuleEngineError('Condition must have a value');
    }
  }

  private async evaluateCondition(
    condition: Condition,
    context: ApprovalContext
  ): Promise<boolean> {
    const value = this.getContextValue(condition.type, context);

    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'gt':
        return typeof value === 'number' || typeof value === 'bigint' 
          ? value > condition.value 
          : false;
      case 'lt':
        return typeof value === 'number' || typeof value === 'bigint'
          ? value < condition.value
          : false;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'contains':
        return typeof value === 'string' && value.includes(condition.value);
      case 'matches':
        return typeof value === 'string' && new RegExp(condition.value).test(value);
      default:
        return false;
    }
  }

  private getContextValue(type: Condition['type'], context: ApprovalContext): any {
    switch (type) {
      case 'amount':
        return context.amount;
      case 'address':
        return context.recipient;
      case 'time':
        return context.timestamp;
      case 'contract':
        return context.contractAddress;
      case 'custom':
        return context.metadata;
      default:
        return undefined;
    }
  }

  private rebuildRuleTree(): void {
    this.ruleTree = this.buildRuleTree(Array.from(this.rules.values()));
  }

  private buildRuleTree(rules: Rule[]): MerkleTree {
    const leaves = rules.map(rule => 
      Buffer.from(this.hashRule(rule))
    );
    return new MerkleTree(leaves, keccak256, { sortPairs: true });
  }

  private hashRule(rule: Rule): string {
    const ruleString = JSON.stringify({
      id: rule.id,
      name: rule.name,
      conditions: rule.conditions,
      requiredApprovals: rule.requiredApprovals,
      approvers: rule.approvers.sort(),
      timeoutMinutes: rule.timeoutMinutes,
      priority: rule.priority
    });
    return keccak256(Buffer.from(ruleString)).toString('hex');
  }
} 