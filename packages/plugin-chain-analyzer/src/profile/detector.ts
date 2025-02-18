import {
  TransactionActivity,
  BehaviorPattern,
  ContractInteraction
} from './types';

interface PatternRule {
  type: BehaviorPattern['type'];
  detect: (
    transactions: TransactionActivity[],
    interactions: ContractInteraction[]
  ) => Promise<{
    score: number;
    evidence: BehaviorPattern['evidence'];
  }>;
}

export class PatternDetector {
  private rules: PatternRule[];

  constructor() {
    this.rules = [
      {
        type: 'trading',
        detect: this.detectTradingPattern.bind(this)
      },
      {
        type: 'farming',
        detect: this.detectFarmingPattern.bind(this)
      },
      {
        type: 'staking',
        detect: this.detectStakingPattern.bind(this)
      },
      {
        type: 'lending',
        detect: this.detectLendingPattern.bind(this)
      },
      {
        type: 'governance',
        detect: this.detectGovernancePattern.bind(this)
      },
      {
        type: 'bot',
        detect: this.detectBotPattern.bind(this)
      }
    ];
  }

  /**
   * 检测地址的行为模式
   */
  async detectPatterns(
    address: string,
    transactions: TransactionActivity[]
  ): Promise<BehaviorPattern[]> {
    const patterns: BehaviorPattern[] = [];
    const interactions = this.analyzeContractInteractions(transactions);

    for (const rule of this.rules) {
      const { score, evidence } = await rule.detect(transactions, interactions);
      if (score > 0) {
        patterns.push({
          type: rule.type,
          score,
          evidence
        });
      }
    }

    return patterns;
  }

  /**
   * 分析合约交互
   */
  private analyzeContractInteractions(
    transactions: TransactionActivity[]
  ): ContractInteraction[] {
    const interactionMap = new Map<string, ContractInteraction>();

    for (const tx of transactions) {
      if (tx.type === 'contract_call' && tx.to) {
        const methodId = tx.input.slice(0, 10);
        const key = `${tx.to}:${methodId}`;
        
        let interaction = interactionMap.get(key);
        if (!interaction) {
          interaction = {
            contract: tx.to,
            method: methodId,
            callCount: 0,
            lastCall: 0,
            totalGasUsed: BigInt(0),
            averageGasUsed: BigInt(0),
            successRate: 0
          };
          interactionMap.set(key, interaction);
        }

        interaction.callCount++;
        interaction.lastCall = tx.timestamp;
        interaction.totalGasUsed += tx.gasUsed;
        interaction.averageGasUsed = interaction.totalGasUsed / BigInt(interaction.callCount);
        interaction.successRate = (interaction.successRate * (interaction.callCount - 1) + (tx.status ? 1 : 0)) / interaction.callCount;
      }
    }

    return Array.from(interactionMap.values());
  }

  /**
   * 检测交易模式
   */
  private async detectTradingPattern(
    transactions: TransactionActivity[],
    interactions: ContractInteraction[]
  ): Promise<{ score: number; evidence: BehaviorPattern['evidence'] }> {
    const evidence: BehaviorPattern['evidence'] = [];
    let score = 0;

    // 检查 DEX 交互频率
    const dexInteractions = interactions.filter(i =>
      this.isDEXContract(i.contract)
    );
    if (dexInteractions.length > 0) {
      const totalCalls = dexInteractions.reduce(
        (sum, i) => sum + i.callCount,
        0
      );
      const avgSuccess = dexInteractions.reduce(
        (sum, i) => sum + i.successRate,
        0
      ) / dexInteractions.length;

      evidence.push({
        type: 'dex_interaction',
        weight: 0.4,
        data: {
          totalCalls,
          avgSuccess,
          contracts: dexInteractions.map(i => i.contract)
        }
      });

      score += Math.min(totalCalls / 100, 1) * 0.4;
    }

    // 检查代币转账频率
    const tokenTransfers = transactions.filter(tx =>
      tx.type === 'token_transfer'
    );
    if (tokenTransfers.length > 0) {
      evidence.push({
        type: 'token_transfers',
        weight: 0.3,
        data: {
          count: tokenTransfers.length,
          tokens: new Set(tokenTransfers.map(tx => tx.tokenInfo?.address))
        }
      });

      score += Math.min(tokenTransfers.length / 50, 1) * 0.3;
    }

    // 检查交易时间模式
    const timePatterns = this.analyzeTimePatterns(transactions);
    evidence.push({
      type: 'time_patterns',
      weight: 0.3,
      data: timePatterns
    });
    score += timePatterns.regularity * 0.3;

    return { score, evidence };
  }

  /**
   * 检测农场模式
   */
  private async detectFarmingPattern(
    transactions: TransactionActivity[],
    interactions: ContractInteraction[]
  ): Promise<{ score: number; evidence: BehaviorPattern['evidence'] }> {
    const evidence: BehaviorPattern['evidence'] = [];
    let score = 0;

    // 检查流动性提供
    const lpInteractions = interactions.filter(i =>
      this.isLPContract(i.contract)
    );
    if (lpInteractions.length > 0) {
      evidence.push({
        type: 'lp_interaction',
        weight: 0.5,
        data: {
          contracts: lpInteractions.map(i => i.contract),
          totalCalls: lpInteractions.reduce((sum, i) => sum + i.callCount, 0)
        }
      });
      score += 0.5;
    }

    // 检查收益收割
    const harvestInteractions = interactions.filter(i =>
      this.isHarvestCall(i.method)
    );
    if (harvestInteractions.length > 0) {
      evidence.push({
        type: 'harvest_calls',
        weight: 0.5,
        data: {
          count: harvestInteractions.length,
          methods: harvestInteractions.map(i => i.method)
        }
      });
      score += 0.5;
    }

    return { score, evidence };
  }

  /**
   * 检测质押模式
   */
  private async detectStakingPattern(
    transactions: TransactionActivity[],
    interactions: ContractInteraction[]
  ): Promise<{ score: number; evidence: BehaviorPattern['evidence'] }> {
    const evidence: BehaviorPattern['evidence'] = [];
    let score = 0;

    // 检查质押合约交互
    const stakingInteractions = interactions.filter(i =>
      this.isStakingContract(i.contract)
    );
    if (stakingInteractions.length > 0) {
      evidence.push({
        type: 'staking_interaction',
        weight: 0.6,
        data: {
          contracts: stakingInteractions.map(i => i.contract),
          totalCalls: stakingInteractions.reduce((sum, i) => sum + i.callCount, 0)
        }
      });
      score += 0.6;
    }

    // 检查长期持有模式
    const holdingPattern = this.analyzeHoldingPattern(transactions);
    evidence.push({
      type: 'holding_pattern',
      weight: 0.4,
      data: holdingPattern
    });
    score += holdingPattern.score * 0.4;

    return { score, evidence };
  }

  /**
   * 检测借贷模式
   */
  private async detectLendingPattern(
    transactions: TransactionActivity[],
    interactions: ContractInteraction[]
  ): Promise<{ score: number; evidence: BehaviorPattern['evidence'] }> {
    const evidence: BehaviorPattern['evidence'] = [];
    let score = 0;

    // 检查借贷平台交互
    const lendingInteractions = interactions.filter(i =>
      this.isLendingContract(i.contract)
    );
    if (lendingInteractions.length > 0) {
      evidence.push({
        type: 'lending_interaction',
        weight: 0.7,
        data: {
          contracts: lendingInteractions.map(i => i.contract),
          totalCalls: lendingInteractions.reduce((sum, i) => sum + i.callCount, 0)
        }
      });
      score += 0.7;
    }

    // 检查借贷操作模式
    const lendingPattern = this.analyzeLendingPattern(transactions);
    evidence.push({
      type: 'lending_pattern',
      weight: 0.3,
      data: lendingPattern
    });
    score += lendingPattern.score * 0.3;

    return { score, evidence };
  }

  /**
   * 检测治理模式
   */
  private async detectGovernancePattern(
    transactions: TransactionActivity[],
    interactions: ContractInteraction[]
  ): Promise<{ score: number; evidence: BehaviorPattern['evidence'] }> {
    const evidence: BehaviorPattern['evidence'] = [];
    let score = 0;

    // 检查治理合约交互
    const governanceInteractions = interactions.filter(i =>
      this.isGovernanceContract(i.contract)
    );
    if (governanceInteractions.length > 0) {
      evidence.push({
        type: 'governance_interaction',
        weight: 0.8,
        data: {
          contracts: governanceInteractions.map(i => i.contract),
          totalCalls: governanceInteractions.reduce((sum, i) => sum + i.callCount, 0)
        }
      });
      score += 0.8;
    }

    // 检查提案和投票模式
    const proposalPattern = this.analyzeProposalPattern(transactions);
    evidence.push({
      type: 'proposal_pattern',
      weight: 0.2,
      data: proposalPattern
    });
    score += proposalPattern.score * 0.2;

    return { score, evidence };
  }

  /**
   * 检测机器人模式
   */
  private async detectBotPattern(
    transactions: TransactionActivity[],
    interactions: ContractInteraction[]
  ): Promise<{ score: number; evidence: BehaviorPattern['evidence'] }> {
    const evidence: BehaviorPattern['evidence'] = [];
    let score = 0;

    // 检查交易频率
    const txFrequency = this.analyzeTransactionFrequency(transactions);
    evidence.push({
      type: 'tx_frequency',
      weight: 0.3,
      data: txFrequency
    });
    score += txFrequency.score * 0.3;

    // 检查 gas 价格模式
    const gasPattern = this.analyzeGasPattern(transactions);
    evidence.push({
      type: 'gas_pattern',
      weight: 0.3,
      data: gasPattern
    });
    score += gasPattern.score * 0.3;

    // 检查交易规律性
    const regularity = this.analyzeTransactionRegularity(transactions);
    evidence.push({
      type: 'tx_regularity',
      weight: 0.4,
      data: regularity
    });
    score += regularity.score * 0.4;

    return { score, evidence };
  }

  /**
   * 分析交易时间模式
   */
  private analyzeTimePatterns(
    transactions: TransactionActivity[]
  ): { regularity: number; patterns: any } {
    // TODO: 实现时间模式分析逻辑
    return { regularity: 0, patterns: {} };
  }

  /**
   * 分析持有模式
   */
  private analyzeHoldingPattern(
    transactions: TransactionActivity[]
  ): { score: number; data: any } {
    // TODO: 实现持有模式分析逻辑
    return { score: 0, data: {} };
  }

  /**
   * 分析借贷模式
   */
  private analyzeLendingPattern(
    transactions: TransactionActivity[]
  ): { score: number; data: any } {
    // TODO: 实现借贷模式分析逻辑
    return { score: 0, data: {} };
  }

  /**
   * 分析提案模式
   */
  private analyzeProposalPattern(
    transactions: TransactionActivity[]
  ): { score: number; data: any } {
    // TODO: 实现提案模式分析逻辑
    return { score: 0, data: {} };
  }

  /**
   * 分析交易频率
   */
  private analyzeTransactionFrequency(
    transactions: TransactionActivity[]
  ): { score: number; data: any } {
    // TODO: 实现交易频率分析逻辑
    return { score: 0, data: {} };
  }

  /**
   * 分析 gas 价格模式
   */
  private analyzeGasPattern(
    transactions: TransactionActivity[]
  ): { score: number; data: any } {
    // TODO: 实现 gas 价格模式分析逻辑
    return { score: 0, data: {} };
  }

  /**
   * 分析交易规律性
   */
  private analyzeTransactionRegularity(
    transactions: TransactionActivity[]
  ): { score: number; data: any } {
    // TODO: 实现交易规律性分析逻辑
    return { score: 0, data: {} };
  }

  /**
   * 检查是否为 DEX 合约
   */
  private isDEXContract(address: string): boolean {
    // TODO: 实现 DEX 合约检查逻辑
    return false;
  }

  /**
   * 检查是否为 LP 合约
   */
  private isLPContract(address: string): boolean {
    // TODO: 实现 LP 合约检查逻辑
    return false;
  }

  /**
   * 检查是否为收割调用
   */
  private isHarvestCall(methodId: string): boolean {
    // TODO: 实现收割调用检查逻辑
    return false;
  }

  /**
   * 检查是否为质押合约
   */
  private isStakingContract(address: string): boolean {
    // TODO: 实现质押合约检查逻辑
    return false;
  }

  /**
   * 检查是否为借贷合约
   */
  private isLendingContract(address: string): boolean {
    // TODO: 实现借贷合约检查逻辑
    return false;
  }

  /**
   * 检查是否为治理合约
   */
  private isGovernanceContract(address: string): boolean {
    // TODO: 实现治理合约检查逻辑
    return false;
  }
} 