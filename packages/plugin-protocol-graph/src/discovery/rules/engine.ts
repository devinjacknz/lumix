import {
  DiscoveryRule,
  DiscoveredRelationship,
  RelationshipEvidence,
  RuleType
} from '../types';
import { NodeProperties, EdgeProperties, EdgeType } from '../../types';
import { CodeAnalyzer } from './analyzers/code';
import { TransactionAnalyzer } from './analyzers/transaction';
import { ProtocolAnalyzer } from './analyzers/protocol';

export class RuleEngine {
  private rules: Map<string, DiscoveryRule>;
  private codeAnalyzer: CodeAnalyzer;
  private transactionAnalyzer: TransactionAnalyzer;
  private protocolAnalyzer: ProtocolAnalyzer;

  constructor() {
    this.rules = new Map();
    this.codeAnalyzer = new CodeAnalyzer();
    this.transactionAnalyzer = new TransactionAnalyzer();
    this.protocolAnalyzer = new ProtocolAnalyzer();
  }

  /**
   * 添加规则
   */
  addRule(rule: DiscoveryRule): void {
    this.validateRule(rule);
    this.rules.set(rule.id, rule);
  }

  /**
   * 移除规则
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * 获取适用的规则
   */
  getApplicableRules(node: NodeProperties): DiscoveryRule[] {
    return Array.from(this.rules.values()).filter(rule =>
      rule.enabled &&
      rule.sourceTypes.includes(node.type)
    );
  }

  /**
   * 应用规则
   */
  async applyRule(
    rule: DiscoveryRule,
    node: NodeProperties
  ): Promise<DiscoveredRelationship[]> {
    try {
      // 获取分析器
      const analyzer = this.getAnalyzer(rule.type);
      if (!analyzer) {
        throw new Error(`No analyzer found for rule type: ${rule.type}`);
      }

      // 分析关系
      const evidence = await analyzer.analyze(node, rule);

      // 创建关系
      return this.createRelationships(node, rule, evidence);
    } catch (error) {
      console.error(`Failed to apply rule ${rule.id}:`, error);
      return [];
    }
  }

  /**
   * 验证规则
   */
  private validateRule(rule: DiscoveryRule): void {
    if (!rule.id || !rule.type || !rule.name) {
      throw new Error('Invalid rule: missing required fields');
    }

    if (!Object.values(RuleType).includes(rule.type)) {
      throw new Error(`Invalid rule type: ${rule.type}`);
    }

    if (!rule.sourceTypes || rule.sourceTypes.length === 0) {
      throw new Error('Invalid rule: no source types specified');
    }

    if (!rule.targetTypes || rule.targetTypes.length === 0) {
      throw new Error('Invalid rule: no target types specified');
    }

    if (!Object.values(EdgeType).includes(rule.edgeType)) {
      throw new Error(`Invalid edge type: ${rule.edgeType}`);
    }

    if (rule.confidence < 0 || rule.confidence > 1) {
      throw new Error('Invalid confidence: must be between 0 and 1');
    }
  }

  /**
   * 获取分析器
   */
  private getAnalyzer(type: RuleType): CodeAnalyzer | TransactionAnalyzer | ProtocolAnalyzer {
    switch (type) {
      case RuleType.CODE_SIMILARITY:
      case RuleType.IMPORT_DEPENDENCY:
      case RuleType.FUNCTION_CALL:
      case RuleType.EVENT_EMISSION:
        return this.codeAnalyzer;

      case RuleType.TRANSACTION_FLOW:
      case RuleType.TOKEN_TRANSFER:
      case RuleType.LIQUIDITY_PROVISION:
      case RuleType.PRICE_CORRELATION:
        return this.transactionAnalyzer;

      case RuleType.PROTOCOL_INTEGRATION:
      case RuleType.MARKET_COMPETITION:
      case RuleType.TVL_CORRELATION:
      case RuleType.USER_OVERLAP:
        return this.protocolAnalyzer;

      default:
        return null;
    }
  }

  /**
   * 创建关系
   */
  private async createRelationships(
    sourceNode: NodeProperties,
    rule: DiscoveryRule,
    evidence: RelationshipEvidence[]
  ): Promise<DiscoveredRelationship[]> {
    const relationships: DiscoveredRelationship[] = [];

    // 按目标节点分组
    const evidenceByTarget = this.groupEvidenceByTarget(evidence);

    // 为每个目标节点创建关系
    for (const [targetId, targetEvidence] of evidenceByTarget.entries()) {
      // 计算置信度
      const confidence = this.calculateConfidence(targetEvidence);
      if (confidence < rule.confidence) {
        continue;
      }

      // 创建边属性
      const edge: EdgeProperties = {
        id: this.generateEdgeId(sourceNode.id, targetId, rule.edgeType),
        type: rule.edgeType,
        from: sourceNode.id,
        to: targetId,
        weight: confidence,
        directed: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          ruleId: rule.id,
          ruleType: rule.type,
          evidence: targetEvidence
        }
      };

      // 创建关系
      relationships.push({
        source: sourceNode,
        target: null, // TODO: 获取目标节点属性
        edge,
        rule,
        evidence: targetEvidence,
        confidence,
        discoveredAt: Date.now()
      });
    }

    return relationships;
  }

  /**
   * 按目标节点分组证据
   */
  private groupEvidenceByTarget(
    evidence: RelationshipEvidence[]
  ): Map<string, RelationshipEvidence[]> {
    const groups = new Map<string, RelationshipEvidence[]>();

    for (const e of evidence) {
      const targetId = e.data.targetId;
      if (!groups.has(targetId)) {
        groups.set(targetId, []);
      }
      groups.get(targetId).push(e);
    }

    return groups;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(evidence: RelationshipEvidence[]): number {
    if (evidence.length === 0) return 0;

    // 加权平均
    let totalWeight = 0;
    let weightedSum = 0;

    for (const e of evidence) {
      const weight = this.getEvidenceWeight(e);
      weightedSum += e.confidence * weight;
      totalWeight += weight;
    }

    return weightedSum / totalWeight;
  }

  /**
   * 获取证据权重
   */
  private getEvidenceWeight(evidence: RelationshipEvidence): number {
    // TODO: 实现证据权重计算逻辑
    return 1;
  }

  /**
   * 生成边 ID
   */
  private generateEdgeId(
    fromId: string,
    toId: string,
    type: EdgeType
  ): string {
    return `${type}:${fromId}:${toId}:${Date.now()}`;
  }
} 