import {
  NodeType,
  EdgeType,
  NodeProperties,
  EdgeProperties
} from '../types';

/**
 * 关系发现规则类型
 */
export enum RuleType {
  // 代码分析规则
  CODE_SIMILARITY = 'code_similarity',
  IMPORT_DEPENDENCY = 'import_dependency',
  FUNCTION_CALL = 'function_call',
  EVENT_EMISSION = 'event_emission',
  
  // 交易分析规则
  TRANSACTION_FLOW = 'transaction_flow',
  TOKEN_TRANSFER = 'token_transfer',
  LIQUIDITY_PROVISION = 'liquidity_provision',
  PRICE_CORRELATION = 'price_correlation',
  
  // 协议分析规则
  PROTOCOL_INTEGRATION = 'protocol_integration',
  MARKET_COMPETITION = 'market_competition',
  TVL_CORRELATION = 'tvl_correlation',
  USER_OVERLAP = 'user_overlap'
}

/**
 * 关系发现规则
 */
export interface DiscoveryRule {
  id: string;
  type: RuleType;
  name: string;
  description: string;
  sourceTypes: NodeType[];
  targetTypes: NodeType[];
  edgeType: EdgeType;
  confidence: number;
  enabled: boolean;
  priority: number;
  
  // 规则参数
  params: {
    minSimilarity?: number;
    maxDistance?: number;
    timeWindow?: number;
    threshold?: number;
    minSamples?: number;
  };

  // 规则元数据
  metadata?: {
    author?: string;
    version?: string;
    tags?: string[];
    createdAt?: number;
    updatedAt?: number;
  };
}

/**
 * 关系证据
 */
export interface RelationshipEvidence {
  type: string;
  confidence: number;
  source: string;
  timestamp: number;
  data: any;
}

/**
 * 发现的关系
 */
export interface DiscoveredRelationship {
  source: NodeProperties;
  target: NodeProperties;
  edge: EdgeProperties;
  rule: DiscoveryRule;
  evidence: RelationshipEvidence[];
  confidence: number;
  discoveredAt: number;
}

/**
 * 发现配置
 */
export interface DiscoveryConfig {
  // 规则配置
  rules?: DiscoveryRule[];
  minConfidence?: number;
  maxRelationships?: number;
  
  // 分析配置
  analysisTimeWindow?: number;
  analysisDepth?: number;
  batchSize?: number;
  
  // 并发配置
  maxConcurrentTasks?: number;
  taskTimeout?: number;
  retryCount?: number;
  
  // 存储配置
  cacheResults?: boolean;
  cacheExpiration?: number;
  persistResults?: boolean;
}

/**
 * 发现结果
 */
export interface DiscoveryResult {
  relationships: DiscoveredRelationship[];
  stats: {
    totalAnalyzed: number;
    totalDiscovered: number;
    ruleStats: Map<RuleType, {
      triggered: number;
      succeeded: number;
      failed: number;
      avgConfidence: number;
    }>;
    timing: {
      startTime: number;
      endTime: number;
      duration: number;
    };
  };
  errors?: Array<{
    rule: string;
    error: Error;
    affectedNodes?: string[];
  }>;
} 