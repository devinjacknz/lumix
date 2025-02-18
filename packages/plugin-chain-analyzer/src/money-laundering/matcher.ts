import {
  TransactionFlow,
  FlowPattern
} from './types';

interface PatternConfig {
  minConfidence: number;
  maxTimeGap: number; // 毫秒
  minFlowCount: number;
  maxFlowCount: number;
}

export class PatternMatcher {
  private config: Record<FlowPattern['type'], PatternConfig>;

  constructor() {
    this.config = {
      layering: {
        minConfidence: 0.7,
        maxTimeGap: 24 * 60 * 60 * 1000, // 24小时
        minFlowCount: 3,
        maxFlowCount: 10
      },
      structuring: {
        minConfidence: 0.8,
        maxTimeGap: 12 * 60 * 60 * 1000, // 12小时
        minFlowCount: 5,
        maxFlowCount: 20
      },
      mixing: {
        minConfidence: 0.75,
        maxTimeGap: 6 * 60 * 60 * 1000, // 6小时
        minFlowCount: 4,
        maxFlowCount: 15
      },
      smurfing: {
        minConfidence: 0.85,
        maxTimeGap: 48 * 60 * 60 * 1000, // 48小时
        minFlowCount: 10,
        maxFlowCount: 50
      },
      cycling: {
        minConfidence: 0.9,
        maxTimeGap: 72 * 60 * 60 * 1000, // 72小时
        minFlowCount: 3,
        maxFlowCount: 8
      }
    };
  }

  /**
   * 检测分层模式
   */
  async detectLayering(
    flows: TransactionFlow[],
    baseRiskScore: number
  ): Promise<FlowPattern[]> {
    const patterns: FlowPattern[] = [];
    const config = this.config.layering;

    // 按时间排序
    const sortedFlows = flows.sort((a, b) => a.timestamp - b.timestamp);

    // 查找连续的转账链
    for (let i = 0; i < sortedFlows.length - config.minFlowCount; i++) {
      const chain: TransactionFlow[] = [];
      const addresses = new Set<string>();
      let lastFlow = sortedFlows[i];

      chain.push(lastFlow);
      addresses.add(lastFlow.from);
      addresses.add(lastFlow.to);

      // 尝试构建转账链
      for (let j = i + 1; j < sortedFlows.length; j++) {
        const currentFlow = sortedFlows[j];
        
        // 检查时间间隔
        if (currentFlow.timestamp - lastFlow.timestamp > config.maxTimeGap) {
          break;
        }

        // 检查是否连续
        if (currentFlow.from === lastFlow.to) {
          chain.push(currentFlow);
          addresses.add(currentFlow.to);
          lastFlow = currentFlow;

          // 检查是否形成有效的分层模式
          if (
            chain.length >= config.minFlowCount &&
            chain.length <= config.maxFlowCount
          ) {
            const evidence = this.analyzeLayeringEvidence(chain);
            const score = this.calculateLayeringScore(evidence, baseRiskScore);

            if (score >= config.minConfidence) {
              patterns.push({
                type: 'layering',
                score,
                flows: chain,
                participants: Array.from(addresses),
                startTime: chain[0].timestamp,
                endTime: chain[chain.length - 1].timestamp,
                totalValue: chain.reduce((sum, flow) => sum + flow.amount, BigInt(0)),
                evidence
              });
            }
          }
        }
      }
    }

    return patterns;
  }

  /**
   * 检测结构化模式
   */
  async detectStructuring(
    flows: TransactionFlow[],
    baseRiskScore: number
  ): Promise<FlowPattern[]> {
    const patterns: FlowPattern[] = [];
    const config = this.config.structuring;

    // 按时间窗口分组
    const timeWindows = this.groupFlowsByTimeWindow(
      flows,
      config.maxTimeGap
    );

    for (const windowFlows of timeWindows) {
      // 查找相似金额的转账
      const groups = this.groupSimilarAmounts(windowFlows);

      for (const group of groups) {
        if (
          group.length >= config.minFlowCount &&
          group.length <= config.maxFlowCount
        ) {
          const evidence = this.analyzeStructuringEvidence(group);
          const score = this.calculateStructuringScore(evidence, baseRiskScore);

          if (score >= config.minConfidence) {
            const addresses = new Set<string>();
            for (const flow of group) {
              addresses.add(flow.from);
              addresses.add(flow.to);
            }

            patterns.push({
              type: 'structuring',
              score,
              flows: group,
              participants: Array.from(addresses),
              startTime: group[0].timestamp,
              endTime: group[group.length - 1].timestamp,
              totalValue: group.reduce((sum, flow) => sum + flow.amount, BigInt(0)),
              evidence
            });
          }
        }
      }
    }

    return patterns;
  }

  /**
   * 检测混合模式
   */
  async detectMixing(
    flows: TransactionFlow[],
    baseRiskScore: number
  ): Promise<FlowPattern[]> {
    const patterns: FlowPattern[] = [];
    const config = this.config.mixing;

    // 查找汇集点
    const mergePoints = this.findMergePoints(flows);

    for (const point of mergePoints) {
      const inFlows = flows.filter(f => f.to === point);
      const outFlows = flows.filter(f => f.from === point);

      if (
        inFlows.length >= config.minFlowCount &&
        outFlows.length >= config.minFlowCount &&
        inFlows.length <= config.maxFlowCount &&
        outFlows.length <= config.maxFlowCount
      ) {
        const mixingFlows = [...inFlows, ...outFlows];
        const evidence = this.analyzeMixingEvidence(inFlows, outFlows);
        const score = this.calculateMixingScore(evidence, baseRiskScore);

        if (score >= config.minConfidence) {
          const addresses = new Set<string>();
          for (const flow of mixingFlows) {
            addresses.add(flow.from);
            addresses.add(flow.to);
          }

          patterns.push({
            type: 'mixing',
            score,
            flows: mixingFlows,
            participants: Array.from(addresses),
            startTime: Math.min(...mixingFlows.map(f => f.timestamp)),
            endTime: Math.max(...mixingFlows.map(f => f.timestamp)),
            totalValue: mixingFlows.reduce((sum, flow) => sum + flow.amount, BigInt(0)),
            evidence
          });
        }
      }
    }

    return patterns;
  }

  /**
   * 检测分散模式
   */
  async detectSmurfing(
    flows: TransactionFlow[],
    baseRiskScore: number
  ): Promise<FlowPattern[]> {
    const patterns: FlowPattern[] = [];
    const config = this.config.smurfing;

    // 查找分散点
    const splitPoints = this.findSplitPoints(flows);

    for (const point of splitPoints) {
      const outFlows = flows.filter(f => f.from === point);

      if (
        outFlows.length >= config.minFlowCount &&
        outFlows.length <= config.maxFlowCount
      ) {
        const evidence = this.analyzeSmurfingEvidence(outFlows);
        const score = this.calculateSmurfingScore(evidence, baseRiskScore);

        if (score >= config.minConfidence) {
          const addresses = new Set<string>();
          for (const flow of outFlows) {
            addresses.add(flow.from);
            addresses.add(flow.to);
          }

          patterns.push({
            type: 'smurfing',
            score,
            flows: outFlows,
            participants: Array.from(addresses),
            startTime: Math.min(...outFlows.map(f => f.timestamp)),
            endTime: Math.max(...outFlows.map(f => f.timestamp)),
            totalValue: outFlows.reduce((sum, flow) => sum + flow.amount, BigInt(0)),
            evidence
          });
        }
      }
    }

    return patterns;
  }

  /**
   * 检测循环模式
   */
  async detectCycling(
    flows: TransactionFlow[],
    baseRiskScore: number
  ): Promise<FlowPattern[]> {
    const patterns: FlowPattern[] = [];
    const config = this.config.cycling;

    // 查找循环路径
    const cycles = this.findCycles(flows);

    for (const cycle of cycles) {
      if (
        cycle.length >= config.minFlowCount &&
        cycle.length <= config.maxFlowCount
      ) {
        const evidence = this.analyzeCyclingEvidence(cycle);
        const score = this.calculateCyclingScore(evidence, baseRiskScore);

        if (score >= config.minConfidence) {
          const addresses = new Set<string>();
          for (const flow of cycle) {
            addresses.add(flow.from);
            addresses.add(flow.to);
          }

          patterns.push({
            type: 'cycling',
            score,
            flows: cycle,
            participants: Array.from(addresses),
            startTime: Math.min(...cycle.map(f => f.timestamp)),
            endTime: Math.max(...cycle.map(f => f.timestamp)),
            totalValue: cycle.reduce((sum, flow) => sum + flow.amount, BigInt(0)),
            evidence
          });
        }
      }
    }

    return patterns;
  }

  /**
   * 分析分层证据
   */
  private analyzeLayeringEvidence(
    flows: TransactionFlow[]
  ): FlowPattern['evidence'] {
    // TODO: 实现分层证据分析逻辑
    return [];
  }

  /**
   * 分析结构化证据
   */
  private analyzeStructuringEvidence(
    flows: TransactionFlow[]
  ): FlowPattern['evidence'] {
    // TODO: 实现结构化证据分析逻辑
    return [];
  }

  /**
   * 分析混合证据
   */
  private analyzeMixingEvidence(
    inFlows: TransactionFlow[],
    outFlows: TransactionFlow[]
  ): FlowPattern['evidence'] {
    // TODO: 实现混合证据分析逻辑
    return [];
  }

  /**
   * 分析分散证据
   */
  private analyzeSmurfingEvidence(
    flows: TransactionFlow[]
  ): FlowPattern['evidence'] {
    // TODO: 实现分散证据分析逻辑
    return [];
  }

  /**
   * 分析循环证据
   */
  private analyzeCyclingEvidence(
    flows: TransactionFlow[]
  ): FlowPattern['evidence'] {
    // TODO: 实现循环证据分析逻辑
    return [];
  }

  /**
   * 计算分层得分
   */
  private calculateLayeringScore(
    evidence: FlowPattern['evidence'],
    baseRiskScore: number
  ): number {
    // TODO: 实现分层得分计算逻辑
    return 0;
  }

  /**
   * 计算结构化得分
   */
  private calculateStructuringScore(
    evidence: FlowPattern['evidence'],
    baseRiskScore: number
  ): number {
    // TODO: 实现结构化得分计算逻辑
    return 0;
  }

  /**
   * 计算混合得分
   */
  private calculateMixingScore(
    evidence: FlowPattern['evidence'],
    baseRiskScore: number
  ): number {
    // TODO: 实现混合得分计算逻辑
    return 0;
  }

  /**
   * 计算分散得分
   */
  private calculateSmurfingScore(
    evidence: FlowPattern['evidence'],
    baseRiskScore: number
  ): number {
    // TODO: 实现分散得分计算逻辑
    return 0;
  }

  /**
   * 计算循环得分
   */
  private calculateCyclingScore(
    evidence: FlowPattern['evidence'],
    baseRiskScore: number
  ): number {
    // TODO: 实现循环得分计算逻辑
    return 0;
  }

  /**
   * 按时间窗口分组
   */
  private groupFlowsByTimeWindow(
    flows: TransactionFlow[],
    windowSize: number
  ): TransactionFlow[][] {
    // TODO: 实现时间窗口分组逻辑
    return [];
  }

  /**
   * 分组相似金额
   */
  private groupSimilarAmounts(
    flows: TransactionFlow[]
  ): TransactionFlow[][] {
    // TODO: 实现相似金额分组逻辑
    return [];
  }

  /**
   * 查找汇集点
   */
  private findMergePoints(flows: TransactionFlow[]): string[] {
    // TODO: 实现汇集点查找逻辑
    return [];
  }

  /**
   * 查找分散点
   */
  private findSplitPoints(flows: TransactionFlow[]): string[] {
    // TODO: 实现分散点查找逻辑
    return [];
  }

  /**
   * 查找循环路径
   */
  private findCycles(flows: TransactionFlow[]): TransactionFlow[][] {
    // TODO: 实现循环路径查找逻辑
    return [];
  }
} 