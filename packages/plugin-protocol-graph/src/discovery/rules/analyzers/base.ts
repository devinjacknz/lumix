import {
  DiscoveryRule,
  RelationshipEvidence,
  RuleType
} from '../../types';
import { NodeProperties } from '../../../types';

export interface Analyzer {
  /**
   * 分析节点关系
   */
  analyze(
    node: NodeProperties,
    rule: DiscoveryRule
  ): Promise<RelationshipEvidence[]>;

  /**
   * 获取支持的规则类型
   */
  getSupportedRuleTypes(): RuleType[];

  /**
   * 验证规则参数
   */
  validateRuleParams(rule: DiscoveryRule): boolean;
}

export abstract class BaseAnalyzer implements Analyzer {
  protected abstract supportedRuleTypes: RuleType[];

  /**
   * 分析节点关系
   */
  abstract analyze(
    node: NodeProperties,
    rule: DiscoveryRule
  ): Promise<RelationshipEvidence[]>;

  /**
   * 获取支持的规则类型
   */
  getSupportedRuleTypes(): RuleType[] {
    return this.supportedRuleTypes;
  }

  /**
   * 验证规则参数
   */
  validateRuleParams(rule: DiscoveryRule): boolean {
    if (!this.supportedRuleTypes.includes(rule.type)) {
      return false;
    }

    const params = rule.params || {};

    switch (rule.type) {
      case RuleType.CODE_SIMILARITY:
        return this.validateCodeSimilarityParams(params);
      case RuleType.IMPORT_DEPENDENCY:
        return this.validateImportDependencyParams(params);
      case RuleType.FUNCTION_CALL:
        return this.validateFunctionCallParams(params);
      case RuleType.EVENT_EMISSION:
        return this.validateEventEmissionParams(params);
      case RuleType.TRANSACTION_FLOW:
        return this.validateTransactionFlowParams(params);
      case RuleType.TOKEN_TRANSFER:
        return this.validateTokenTransferParams(params);
      case RuleType.LIQUIDITY_PROVISION:
        return this.validateLiquidityProvisionParams(params);
      case RuleType.PRICE_CORRELATION:
        return this.validatePriceCorrelationParams(params);
      case RuleType.PROTOCOL_INTEGRATION:
        return this.validateProtocolIntegrationParams(params);
      case RuleType.MARKET_COMPETITION:
        return this.validateMarketCompetitionParams(params);
      case RuleType.TVL_CORRELATION:
        return this.validateTVLCorrelationParams(params);
      case RuleType.USER_OVERLAP:
        return this.validateUserOverlapParams(params);
      default:
        return false;
    }
  }

  /**
   * 创建证据
   */
  protected createEvidence(
    type: string,
    confidence: number,
    data: any
  ): RelationshipEvidence {
    return {
      type,
      confidence,
      source: this.constructor.name,
      timestamp: Date.now(),
      data
    };
  }

  /**
   * 验证代码相似度参数
   */
  private validateCodeSimilarityParams(params: any): boolean {
    return (
      typeof params.minSimilarity === 'number' &&
      params.minSimilarity >= 0 &&
      params.minSimilarity <= 1
    );
  }

  /**
   * 验证导入依赖参数
   */
  private validateImportDependencyParams(params: any): boolean {
    return (
      typeof params.maxDistance === 'number' &&
      params.maxDistance > 0
    );
  }

  /**
   * 验证函数调用参数
   */
  private validateFunctionCallParams(params: any): boolean {
    return (
      typeof params.minSamples === 'number' &&
      params.minSamples > 0
    );
  }

  /**
   * 验证事件发射参数
   */
  private validateEventEmissionParams(params: any): boolean {
    return (
      typeof params.timeWindow === 'number' &&
      params.timeWindow > 0
    );
  }

  /**
   * 验证交易流参数
   */
  private validateTransactionFlowParams(params: any): boolean {
    return (
      typeof params.timeWindow === 'number' &&
      params.timeWindow > 0 &&
      typeof params.minSamples === 'number' &&
      params.minSamples > 0
    );
  }

  /**
   * 验证代币转账参数
   */
  private validateTokenTransferParams(params: any): boolean {
    return (
      typeof params.timeWindow === 'number' &&
      params.timeWindow > 0 &&
      typeof params.threshold === 'number' &&
      params.threshold > 0
    );
  }

  /**
   * 验证流动性提供参数
   */
  private validateLiquidityProvisionParams(params: any): boolean {
    return (
      typeof params.timeWindow === 'number' &&
      params.timeWindow > 0 &&
      typeof params.threshold === 'number' &&
      params.threshold > 0
    );
  }

  /**
   * 验证价格相关性参数
   */
  private validatePriceCorrelationParams(params: any): boolean {
    return (
      typeof params.timeWindow === 'number' &&
      params.timeWindow > 0 &&
      typeof params.minSamples === 'number' &&
      params.minSamples > 0 &&
      typeof params.threshold === 'number' &&
      params.threshold >= 0 &&
      params.threshold <= 1
    );
  }

  /**
   * 验证协议集成参数
   */
  private validateProtocolIntegrationParams(params: any): boolean {
    return (
      typeof params.minSimilarity === 'number' &&
      params.minSimilarity >= 0 &&
      params.minSimilarity <= 1
    );
  }

  /**
   * 验证市场竞争参数
   */
  private validateMarketCompetitionParams(params: any): boolean {
    return (
      typeof params.timeWindow === 'number' &&
      params.timeWindow > 0 &&
      typeof params.threshold === 'number' &&
      params.threshold > 0
    );
  }

  /**
   * 验证 TVL 相关性参数
   */
  private validateTVLCorrelationParams(params: any): boolean {
    return (
      typeof params.timeWindow === 'number' &&
      params.timeWindow > 0 &&
      typeof params.minSamples === 'number' &&
      params.minSamples > 0 &&
      typeof params.threshold === 'number' &&
      params.threshold >= 0 &&
      params.threshold <= 1
    );
  }

  /**
   * 验证用户重叠参数
   */
  private validateUserOverlapParams(params: any): boolean {
    return (
      typeof params.timeWindow === 'number' &&
      params.timeWindow > 0 &&
      typeof params.threshold === 'number' &&
      params.threshold >= 0 &&
      params.threshold <= 1
    );
  }
} 