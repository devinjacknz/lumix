import { BaseError } from '@lumix/core';

export class GraphError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GraphError';
  }
}

/**
 * 节点类型
 */
export enum NodeType {
  // 协议类型
  PROTOCOL = 'protocol',
  DEX = 'dex',
  LENDING = 'lending',
  YIELD = 'yield',
  BRIDGE = 'bridge',
  ORACLE = 'oracle',
  
  // 资产类型
  TOKEN = 'token',
  LP_TOKEN = 'lp_token',
  NFT = 'nft',
  
  // 合约类型
  CONTRACT = 'contract',
  FACTORY = 'factory',
  ROUTER = 'router',
  POOL = 'pool',
  VAULT = 'vault',
  
  // 参与者类型
  DEPLOYER = 'deployer',
  ADMIN = 'admin',
  USER = 'user'
}

/**
 * 边类型
 */
export enum EdgeType {
  // 协议关系
  INTEGRATES = 'integrates',
  DEPENDS_ON = 'depends_on',
  COMPETES_WITH = 'competes_with',
  FORKED_FROM = 'forked_from',
  
  // 资产关系
  MINTS = 'mints',
  BURNS = 'burns',
  SWAPS = 'swaps',
  WRAPS = 'wraps',
  BRIDGES = 'bridges',
  
  // 合约关系
  DEPLOYS = 'deploys',
  CALLS = 'calls',
  CREATES = 'creates',
  UPGRADES = 'upgrades',
  
  // 参与者关系
  OWNS = 'owns',
  MANAGES = 'manages',
  INTERACTS = 'interacts'
}

/**
 * 节点属性
 */
export interface NodeProperties {
  // 基础属性
  id: string;
  type: NodeType;
  name: string;
  address?: string;
  createdAt: number;
  updatedAt: number;

  // 协议属性
  version?: string;
  category?: string;
  description?: string;
  website?: string;
  github?: string;
  twitter?: string;
  discord?: string;

  // 资产属性
  symbol?: string;
  decimals?: number;
  totalSupply?: bigint;
  marketCap?: bigint;
  price?: bigint;

  // 合约属性
  implementation?: string;
  bytecode?: string;
  verified?: boolean;
  audited?: boolean;

  // 参与者属性
  role?: string;
  reputation?: number;
  active?: boolean;

  // 统计属性
  tvl?: bigint;
  volume24h?: bigint;
  transactions?: number;
  users?: number;

  // 风险属性
  riskScore?: number;
  riskFactors?: string[];
  securityIncidents?: Array<{
    type: string;
    date: number;
    description: string;
    impact: string;
  }>;

  // 元数据
  metadata?: Record<string, any>;
  tags?: string[];
}

/**
 * 边属性
 */
export interface EdgeProperties {
  // 基础属性
  id: string;
  type: EdgeType;
  from: string;
  to: string;
  createdAt: number;
  updatedAt: number;

  // 关系属性
  weight: number;
  directed: boolean;
  temporary?: boolean;
  bidirectional?: boolean;

  // 交互属性
  txCount?: number;
  lastTx?: string;
  volume?: bigint;
  frequency?: number;

  // 依赖属性
  dependencyType?: string;
  critical?: boolean;
  version?: string;
  compatibility?: string[];

  // 集成属性
  integrationType?: string;
  apiVersion?: string;
  permissions?: string[];
  restrictions?: string[];

  // 竞争属性
  marketShare?: number;
  competitionType?: string;
  advantages?: string[];
  disadvantages?: string[];

  // 风险属性
  riskLevel?: number;
  riskFactors?: string[];
  mitigations?: string[];

  // 元数据
  metadata?: Record<string, any>;
  tags?: string[];
}

/**
 * 图查询过滤器
 */
export interface GraphFilter {
  nodeTypes?: NodeType[];
  edgeTypes?: EdgeType[];
  startTime?: number;
  endTime?: number;
  minWeight?: number;
  maxDepth?: number;
  excludeNodes?: string[];
  excludeEdges?: string[];
  includeMetadata?: boolean;
  includeTags?: string[];
}

/**
 * 图分析配置
 */
export interface GraphAnalysisConfig {
  // 节点重要性配置
  nodeCentralityConfig?: {
    algorithm: 'degree' | 'betweenness' | 'closeness' | 'pagerank';
    weighted?: boolean;
    normalized?: boolean;
    directed?: boolean;
  };

  // 社区检测配置
  communityDetectionConfig?: {
    algorithm: 'louvain' | 'label_propagation' | 'infomap';
    resolution?: number;
    maxIterations?: number;
    randomSeed?: number;
  };

  // 路径分析配置
  pathAnalysisConfig?: {
    algorithm: 'shortest_path' | 'all_paths' | 'minimum_spanning_tree';
    weighted?: boolean;
    directed?: boolean;
    maxPaths?: number;
  };

  // 风险传导配置
  riskPropagationConfig?: {
    algorithm: 'cascade' | 'threshold' | 'independent_cascade';
    threshold?: number;
    decayFactor?: number;
    maxIterations?: number;
  };
}

/**
 * 图分析结果
 */
export interface GraphAnalysisResult {
  // 节点分析
  nodeCentrality?: Map<string, number>;
  communities?: Map<string, string[]>;
  influentialNodes?: string[];
  vulnerableNodes?: string[];

  // 边分析
  criticalPaths?: Array<{
    path: string[];
    weight: number;
    riskLevel: number;
  }>;
  bridgingEdges?: string[];
  weakLinks?: string[];

  // 风险分析
  riskScores?: Map<string, number>;
  riskPropagation?: Map<string, Array<{
    node: string;
    impact: number;
    probability: number;
  }>>;
  systemicRisk?: number;

  // 统计分析
  stats: {
    nodeCount: number;
    edgeCount: number;
    density: number;
    averageDegree: number;
    clusteringCoefficient: number;
    averagePathLength: number;
    diameter: number;
  };
} 