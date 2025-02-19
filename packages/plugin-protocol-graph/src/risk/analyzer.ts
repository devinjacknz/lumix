import { BaseError } from '@lumix/core';
import { StorageAdapter } from '../storage/adapter';
import { NodeProperties, EdgeProperties, GraphAnalysisConfig, GraphAnalysisResult } from '../types';

export class RiskAnalysisError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RiskAnalysisError';
  }
}

export interface RiskScore {
  score: number;
  factors: Array<{
    type: string;
    weight: number;
    score: number;
    evidence: any;
  }>;
  timestamp: number;
}

export interface RiskImpact {
  directImpact: number;
  indirectImpact: number;
  propagationPath: string[];
  affectedNodes: Array<{
    id: string;
    impact: number;
    distance: number;
  }>;
}

export interface PropagationConfig {
  // 传导算法配置
  algorithm: 'cascade' | 'threshold' | 'independent_cascade';
  decayFactor?: number; // 风险衰减因子
  threshold?: number; // 风险传导阈值
  maxIterations?: number; // 最大迭代次数
  maxDepth?: number; // 最大传导深度

  // 边权重配置
  edgeWeights?: {
    [key: string]: number; // 不同类型边的权重
  };
  minEdgeWeight?: number; // 最小边权重
  normalizeWeights?: boolean; // 是否归一化权重

  // 节点配置
  nodeWeights?: {
    [key: string]: number; // 不同类型节点的权重
  };
  immuneNodes?: string[]; // 免疫节点列表
  seedNodes?: string[]; // 初始风险节点列表
}

export interface AnalysisResult {
  // 节点风险评分
  nodeRiskScores: Map<string, RiskScore>;
  
  // 系统性风险
  systemicRisk: {
    score: number;
    components: Array<{
      type: string;
      score: number;
      evidence: any;
    }>;
  };

  // 风险传导
  propagation: {
    paths: Array<{
      path: string[];
      risk: number;
      impact: number;
    }>;
    impacts: Map<string, RiskImpact>;
  };

  // 脆弱性分析
  vulnerabilities: Array<{
    node: string;
    score: number;
    factors: Array<{
      type: string;
      score: number;
      evidence: any;
    }>;
  }>;

  // 统计信息
  stats: {
    totalNodes: number;
    affectedNodes: number;
    averageImpact: number;
    maxImpact: number;
    propagationDepth: number;
    convergenceIterations: number;
  };
}

export class RiskAnalyzer {
  private storage: StorageAdapter;
  private config: Required<GraphAnalysisConfig['riskPropagationConfig']>;
  private nodeScores: Map<string, number>;
  private edgeWeights: Map<string, number>;
  private propagationState: Map<string, {
    currentRisk: number;
    previousRisk: number;
    depth: number;
    path: string[];
  }>;

  constructor(
    storage: StorageAdapter,
    config: GraphAnalysisConfig['riskPropagationConfig'] = {}
  ) {
    this.storage = storage;
    this.config = {
      algorithm: config.algorithm || 'cascade',
      decayFactor: config.decayFactor || 0.85,
      threshold: config.threshold || 0.1,
      maxIterations: config.maxIterations || 100,
      maxDepth: config.maxDepth || 5,
      edgeWeights: config.edgeWeights || {
        [EdgeType.INTEGRATES]: 0.8,
        [EdgeType.DEPENDS_ON]: 0.9,
        [EdgeType.COMPETES_WITH]: 0.3,
        [EdgeType.FORKED_FROM]: 0.6
      },
      minEdgeWeight: config.minEdgeWeight || 0.1,
      normalizeWeights: config.normalizeWeights ?? true,
      nodeWeights: config.nodeWeights || {
        [NodeType.PROTOCOL]: 1.0,
        [NodeType.DEX]: 0.9,
        [NodeType.LENDING]: 0.8,
        [NodeType.BRIDGE]: 0.7
      },
      immuneNodes: config.immuneNodes || [],
      seedNodes: config.seedNodes || []
    };

    this.nodeScores = new Map();
    this.edgeWeights = new Map();
    this.propagationState = new Map();
  }

  /**
   * 分析风险传导
   */
  async analyzeRiskPropagation(
    startNodes?: string[]
  ): Promise<GraphAnalysisResult> {
    try {
      // 初始化
      await this.initialize(startNodes);

      // 传播风险
      const { paths, impacts } = await this.propagateRisk();

      // 分析系统性风险
      const systemicRisk = this.analyzeSystemicRisk();

      // 分析脆弱性
      const vulnerabilities = this.analyzeVulnerabilities();

      // 计算统计信息
      const stats = this.calculateStats();

      return {
        nodeCentrality: this.nodeScores,
        communities: undefined,
        influentialNodes: Array.from(this.nodeScores.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id]) => id),
        vulnerableNodes: vulnerabilities.map(v => v.node),
        criticalPaths: paths,
        bridgingEdges: undefined,
        weakLinks: undefined,
        riskScores: this.nodeScores,
        riskPropagation: impacts,
        systemicRisk,
        vulnerabilities,
        stats
      };
    } catch (error) {
      throw new GraphError('Failed to analyze risk propagation', {
        cause: error
      });
    }
  }

  /**
   * 初始化分析
   */
  private async initialize(startNodes?: string[]): Promise<void> {
    // 清理状态
    this.nodeScores.clear();
    this.edgeWeights.clear();
    this.propagationState.clear();

    // 计算边权重
    await this.calculateEdgeWeights();

    // 初始化节点风险分数
    const nodes = startNodes || this.config.seedNodes;
    for (const nodeId of nodes) {
      const score = await this.calculateInitialRiskScore(nodeId);
      this.nodeScores.set(nodeId, score);
      this.propagationState.set(nodeId, {
        currentRisk: score,
        previousRisk: 0,
        depth: 0,
        path: [nodeId]
      });
    }
  }

  /**
   * 传播风险
   */
  private async propagateRisk(): Promise<{
    paths: Array<{
      path: string[];
      risk: number;
      impact: number;
    }>;
    impacts: Map<string, {
      directImpact: number;
      indirectImpact: number;
      propagationPath: string[];
      affectedNodes: Array<{
        id: string;
        impact: number;
        distance: number;
      }>;
    }>;
  }> {
    const paths: Array<{
      path: string[];
      risk: number;
      impact: number;
    }> = [];
    const impacts = new Map<string, {
      directImpact: number;
      indirectImpact: number;
      propagationPath: string[];
      affectedNodes: Array<{
        id: string;
        impact: number;
        distance: number;
      }>;
    }>();

    let iteration = 0;
    let converged = false;

    while (!converged && iteration < this.config.maxIterations) {
      converged = true;
      iteration++;

      // 保存当前状态
      for (const [nodeId, state] of this.propagationState.entries()) {
        state.previousRisk = state.currentRisk;
      }

      // 传播风险
      for (const [nodeId, state] of this.propagationState.entries()) {
        if (state.depth >= this.config.maxDepth) continue;
        if (this.config.immuneNodes.includes(nodeId)) continue;

        // 获取相邻节点
        const neighbors = await this.getNeighbors(nodeId);

        // 传播到每个相邻节点
        for (const { node: neighbor, edge } of neighbors) {
          if (this.config.immuneNodes.includes(neighbor.id)) continue;

          // 计算传播的风险值
          const propagatedRisk = this.calculatePropagatedRisk(
            state.currentRisk,
            edge,
            state.depth + 1
          );

          // 更新相邻节点状态
          let neighborState = this.propagationState.get(neighbor.id);
          if (!neighborState) {
            neighborState = {
              currentRisk: 0,
              previousRisk: 0,
              depth: state.depth + 1,
              path: [...state.path, neighbor.id]
            };
            this.propagationState.set(neighbor.id, neighborState);
          }

          // 如果新的风险值更高，更新状态
          if (propagatedRisk > neighborState.currentRisk) {
            neighborState.currentRisk = propagatedRisk;
            neighborState.path = [...state.path, neighbor.id];
            converged = false;

            // 更新影响
            this.updateImpact(neighbor.id, nodeId, propagatedRisk, impacts);
          }
        }
      }

      // 更新节点分数
      for (const [nodeId, state] of this.propagationState.entries()) {
        this.nodeScores.set(nodeId, state.currentRisk);
      }
    }

    // 收集关键路径
    for (const [nodeId, state] of this.propagationState.entries()) {
      if (state.currentRisk > this.config.threshold) {
        paths.push({
          path: state.path,
          risk: state.currentRisk,
          impact: this.calculatePathImpact(state.path)
        });
      }
    }

    // 按风险值排序
    paths.sort((a, b) => b.risk - a.risk);

    return { paths, impacts };
  }

  /**
   * 分析系统性风险
   */
  private analyzeSystemicRisk(): GraphAnalysisResult['systemicRisk'] {
    // 计算中心性风险
    const centralityRisk = this.calculateCentralityRisk();

    // 计算互连性风险
    const interconnectednessRisk = this.calculateInterconnectednessRisk();

    // 计算同质性风险
    const homogeneityRisk = this.calculateHomogeneityRisk();

    // 计算总体系统性风险
    const score = (
      centralityRisk.score * 0.4 +
      interconnectednessRisk.score * 0.4 +
      homogeneityRisk.score * 0.2
    );

    return {
      score,
      components: [
        {
          type: 'centrality',
          score: centralityRisk.score,
          evidence: centralityRisk.evidence
        },
        {
          type: 'interconnectedness',
          score: interconnectednessRisk.score,
          evidence: interconnectednessRisk.evidence
        },
        {
          type: 'homogeneity',
          score: homogeneityRisk.score,
          evidence: homogeneityRisk.evidence
        }
      ]
    };
  }

  /**
   * 分析脆弱性
   */
  private analyzeVulnerabilities(): GraphAnalysisResult['vulnerabilities'] {
    const vulnerabilities: GraphAnalysisResult['vulnerabilities'] = [];

    for (const [nodeId, risk] of this.nodeScores.entries()) {
      if (risk > this.config.threshold) {
        vulnerabilities.push({
          node: nodeId,
          score: risk,
          factors: this.analyzeVulnerabilityFactors(nodeId)
        });
      }
    }

    return vulnerabilities.sort((a, b) => b.score - a.score);
  }

  /**
   * 计算统计信息
   */
  private calculateStats(): GraphAnalysisResult['stats'] {
    const affectedNodes = Array.from(this.nodeScores.entries())
      .filter(([_, score]) => score > 0);

    return {
      nodeCount: this.nodeScores.size,
      edgeCount: this.edgeWeights.size,
      density: this.edgeWeights.size / (this.nodeScores.size * (this.nodeScores.size - 1)),
      averageDegree: this.edgeWeights.size / this.nodeScores.size,
      clusteringCoefficient: 0, // TODO: 实现聚类系数计算
      averagePathLength: 0, // TODO: 实现平均路径长度计算
      diameter: Math.max(...Array.from(this.propagationState.values()).map(s => s.depth))
    };
  }

  /**
   * 计算初始风险分数
   */
  private async calculateInitialRiskScore(
    nodeId: string
  ): Promise<number> {
    const result = await this.storage.getNode(nodeId);
    if (!result.success || !result.data) {
      return 0;
    }

    const node = result.data;
    return this.config.nodeWeights[node.type] || 0.5;
  }

  /**
   * 计算边权重
   */
  private async calculateEdgeWeights(): Promise<void> {
    // TODO: 实现边权重计算逻辑
  }

  /**
   * 获取相邻节点
   */
  private async getNeighbors(
    nodeId: string
  ): Promise<Array<{
    node: NodeProperties;
    edge: EdgeProperties;
  }>> {
    const result = await this.storage.getNeighbors(nodeId);
    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(({ node, edge }) => ({
      node,
      edge
    }));
  }

  /**
   * 计算传播的风险值
   */
  private calculatePropagatedRisk(
    sourceRisk: number,
    edge: EdgeProperties,
    depth: number
  ): number {
    const edgeWeight = this.edgeWeights.get(edge.id) || this.config.minEdgeWeight;
    const decayFactor = Math.pow(this.config.decayFactor, depth);
    return sourceRisk * edgeWeight * decayFactor;
  }

  /**
   * 更新影响
   */
  private updateImpact(
    nodeId: string,
    sourceId: string,
    risk: number,
    impacts: Map<string, {
      directImpact: number;
      indirectImpact: number;
      propagationPath: string[];
      affectedNodes: Array<{
        id: string;
        impact: number;
        distance: number;
      }>;
    }>
  ): void {
    let impact = impacts.get(nodeId);
    if (!impact) {
      impact = {
        directImpact: 0,
        indirectImpact: 0,
        propagationPath: [],
        affectedNodes: []
      };
      impacts.set(nodeId, impact);
    }

    const state = this.propagationState.get(nodeId);
    if (!state) return;

    // 更新直接影响
    if (state.depth === 1) {
      impact.directImpact = Math.max(impact.directImpact, risk);
    } else {
      impact.indirectImpact = Math.max(impact.indirectImpact, risk);
    }

    // 更新传播路径
    if (risk > impact.directImpact + impact.indirectImpact) {
      impact.propagationPath = state.path;
    }

    // 更新受影响节点
    const affectedNode = impact.affectedNodes.find(n => n.id === sourceId);
    if (affectedNode) {
      affectedNode.impact = Math.max(affectedNode.impact, risk);
    } else {
      impact.affectedNodes.push({
        id: sourceId,
        impact: risk,
        distance: state.depth
      });
    }

    // 按影响程度排序
    impact.affectedNodes.sort((a, b) => b.impact - a.impact);
  }

  /**
   * 计算路径影响
   */
  private calculatePathImpact(path: string[]): number {
    let impact = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const sourceRisk = this.nodeScores.get(path[i]) || 0;
      const targetRisk = this.nodeScores.get(path[i + 1]) || 0;
      impact += sourceRisk * targetRisk;
    }
    return impact;
  }

  /**
   * 计算中心性风险
   */
  private calculateCentralityRisk(): {
    score: number;
    evidence: any;
  } {
    // TODO: 实现中心性风险计算逻辑
    return { score: 0, evidence: {} };
  }

  /**
   * 计算互连性风险
   */
  private calculateInterconnectednessRisk(): {
    score: number;
    evidence: any;
  } {
    // TODO: 实现互连性风险计算逻辑
    return { score: 0, evidence: {} };
  }

  /**
   * 计算同质性风险
   */
  private calculateHomogeneityRisk(): {
    score: number;
    evidence: any;
  } {
    // TODO: 实现同质性风险计算逻辑
    return { score: 0, evidence: {} };
  }

  /**
   * 分析脆弱性因素
   */
  private analyzeVulnerabilityFactors(
    nodeId: string
  ): Array<{
    type: string;
    score: number;
    evidence: any;
  }> {
    // TODO: 实现脆弱性因素分析逻辑
    return [];
  }
} 