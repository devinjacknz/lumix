import {
  TransactionActivity,
  BehaviorPattern
} from './types';

interface RiskFactor {
  type: string;
  weight: number;
  evaluate: (
    patterns: BehaviorPattern[],
    transactions: TransactionActivity[],
    state: any
  ) => number;
}

export class RiskScorer {
  private factors: RiskFactor[];

  constructor() {
    this.factors = [
      {
        type: 'behavior_risk',
        weight: 0.3,
        evaluate: this.evaluateBehaviorRisk.bind(this)
      },
      {
        type: 'transaction_risk',
        weight: 0.3,
        evaluate: this.evaluateTransactionRisk.bind(this)
      },
      {
        type: 'interaction_risk',
        weight: 0.2,
        evaluate: this.evaluateInteractionRisk.bind(this)
      },
      {
        type: 'temporal_risk',
        weight: 0.2,
        evaluate: this.evaluateTemporalRisk.bind(this)
      }
    ];
  }

  /**
   * 计算地址风险评分
   */
  calculateRiskScore(
    patterns: BehaviorPattern[],
    transactions: TransactionActivity[],
    state: any
  ): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const factor of this.factors) {
      const score = factor.evaluate(patterns, transactions, state);
      totalScore += score * factor.weight;
      totalWeight += factor.weight;
    }

    // 归一化到 0-100 范围
    return Math.min(Math.round((totalScore / totalWeight) * 100), 100);
  }

  /**
   * 评估行为风险
   */
  private evaluateBehaviorRisk(
    patterns: BehaviorPattern[],
    transactions: TransactionActivity[],
    state: any
  ): number {
    let riskScore = 0;

    // 检查机器人行为
    const botPattern = patterns.find(p => p.type === 'bot');
    if (botPattern && botPattern.score > 0.8) {
      riskScore += 0.5;
    }

    // 检查高频交易行为
    const tradingPattern = patterns.find(p => p.type === 'trading');
    if (tradingPattern && tradingPattern.score > 0.7) {
      const evidence = tradingPattern.evidence.find(e => e.type === 'tx_frequency');
      if (evidence && evidence.data.frequency > 100) { // 每天超过100笔交易
        riskScore += 0.3;
      }
    }

    // 检查异常借贷行为
    const lendingPattern = patterns.find(p => p.type === 'lending');
    if (lendingPattern && lendingPattern.score > 0.6) {
      const evidence = lendingPattern.evidence.find(e => e.type === 'lending_pattern');
      if (evidence && evidence.data.liquidationRisk > 0.8) {
        riskScore += 0.2;
      }
    }

    return riskScore;
  }

  /**
   * 评估交易风险
   */
  private evaluateTransactionRisk(
    patterns: BehaviorPattern[],
    transactions: TransactionActivity[],
    state: any
  ): number {
    let riskScore = 0;

    // 检查失败交易比例
    const failedTxs = transactions.filter(tx => !tx.status);
    const failureRate = failedTxs.length / transactions.length;
    if (failureRate > 0.2) { // 失败率超过20%
      riskScore += failureRate * 0.4;
    }

    // 检查大额交易
    const largeTransfers = transactions.filter(tx =>
      tx.value > BigInt(1e18) * BigInt(100) // 超过100 ETH
    );
    if (largeTransfers.length > 0) {
      riskScore += Math.min(largeTransfers.length / 10, 1) * 0.3;
    }

    // 检查交易对手方
    const uniqueCounterparties = new Set(
      transactions.map(tx => tx.to)
    ).size;
    if (uniqueCounterparties < 5) { // 交易对手方过少
      riskScore += 0.3;
    }

    return riskScore;
  }

  /**
   * 评估交互风险
   */
  private evaluateInteractionRisk(
    patterns: BehaviorPattern[],
    transactions: TransactionActivity[],
    state: any
  ): number {
    let riskScore = 0;

    // 检查与高风险合约的交互
    const contractInteractions = transactions.filter(tx =>
      tx.type === 'contract_call'
    );
    const riskContractInteractions = contractInteractions.filter(tx =>
      this.isRiskContract(tx.to)
    );
    if (riskContractInteractions.length > 0) {
      riskScore += Math.min(riskContractInteractions.length / contractInteractions.length, 1) * 0.5;
    }

    // 检查合约调用失败率
    const failedCalls = contractInteractions.filter(tx => !tx.status);
    const callFailureRate = failedCalls.length / contractInteractions.length;
    if (callFailureRate > 0.3) { // 调用失败率超过30%
      riskScore += callFailureRate * 0.3;
    }

    // 检查异常的方法调用
    const suspiciousCalls = contractInteractions.filter(tx =>
      this.isSuspiciousMethod(tx.input.slice(0, 10))
    );
    if (suspiciousCalls.length > 0) {
      riskScore += Math.min(suspiciousCalls.length / 10, 1) * 0.2;
    }

    return riskScore;
  }

  /**
   * 评估时间风险
   */
  private evaluateTemporalRisk(
    patterns: BehaviorPattern[],
    transactions: TransactionActivity[],
    state: any
  ): number {
    let riskScore = 0;

    // 检查账户年龄
    const firstTx = transactions[0];
    const lastTx = transactions[transactions.length - 1];
    const accountAge = lastTx.timestamp - firstTx.timestamp;
    if (accountAge < 7 * 24 * 60 * 60) { // 账户年龄小于7天
      riskScore += 0.4;
    }

    // 检查交易时间分布
    const timeDistribution = this.analyzeTimeDistribution(transactions);
    if (timeDistribution.irregularity > 0.8) { // 高度不规律
      riskScore += 0.3;
    }

    // 检查突发活动
    const burstActivity = this.analyzeBurstActivity(transactions);
    if (burstActivity.hasBurst) {
      riskScore += 0.3;
    }

    return riskScore;
  }

  /**
   * 分析交易时间分布
   */
  private analyzeTimeDistribution(
    transactions: TransactionActivity[]
  ): { irregularity: number; distribution: any } {
    // TODO: 实现时间分布分析逻辑
    return { irregularity: 0, distribution: {} };
  }

  /**
   * 分析突发活动
   */
  private analyzeBurstActivity(
    transactions: TransactionActivity[]
  ): { hasBurst: boolean; bursts: any[] } {
    // TODO: 实现突发活动分析逻辑
    return { hasBurst: false, bursts: [] };
  }

  /**
   * 检查是否为高风险合约
   */
  private isRiskContract(address: string): boolean {
    // TODO: 实现高风险合约检查逻辑
    return false;
  }

  /**
   * 检查是否为可疑方法调用
   */
  private isSuspiciousMethod(methodId: string): boolean {
    // TODO: 实现可疑方法调用检查逻辑
    return false;
  }
} 