import { BaseError } from '@lumix/core';
import { LiquidityAnalyzer } from '@lumix/plugin-defi-crawler';
import { MEVCalculator, LiquidityChange } from './calculator';

export class MEVError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MEVError';
  }
}

export interface MEVPattern {
  type: 'sandwich' | 'frontrunning' | 'backrunning' | 'arbitrage';
  confidence: number;
  profit: bigint;
  transactions: string[];
  metadata: Record<string, any>;
}

export interface MEVDetectionConfig {
  minProfitThreshold: bigint;
  maxBlockRange: number;
  confidenceThreshold: number;
  liquidityAnalyzer: LiquidityAnalyzer;
}

export class MEVDetector {
  private config: Required<MEVDetectionConfig>;
  private liquidityAnalyzer: LiquidityAnalyzer;
  private calculator: MEVCalculator;
  private patterns: Map<string, MEVPattern>;

  constructor(config: MEVDetectionConfig) {
    this.config = {
      minProfitThreshold: config.minProfitThreshold,
      maxBlockRange: config.maxBlockRange,
      confidenceThreshold: config.confidenceThreshold,
      liquidityAnalyzer: config.liquidityAnalyzer
    };
    this.liquidityAnalyzer = config.liquidityAnalyzer;
    this.calculator = new MEVCalculator();
    this.patterns = new Map();
  }

  /**
   * 检测交易组中的三明治攻击模式
   */
  async detectSandwichAttacks(
    blockNumber: number,
    transactions: string[]
  ): Promise<MEVPattern[]> {
    const patterns: MEVPattern[] = [];
    const liquidityChanges = await this.liquidityAnalyzer.getBlockLiquidityChanges(
      blockNumber
    );

    for (let i = 0; i < transactions.length - 2; i++) {
      const frontTx = transactions[i];
      const victimTx = transactions[i + 1];
      const backTx = transactions[i + 2];

      // 分析流动性变化
      const frontChange = liquidityChanges.get(frontTx);
      const victimChange = liquidityChanges.get(victimTx);
      const backChange = liquidityChanges.get(backTx);

      if (!frontChange || !victimChange || !backChange) {
        continue;
      }

      // 计算利润
      const profit = this.calculateSandwichProfit(
        frontChange,
        victimChange,
        backChange
      );

      if (profit > this.config.minProfitThreshold) {
        const confidence = this.calculateSandwichConfidence(
          frontChange,
          victimChange,
          backChange
        );

        if (confidence >= this.config.confidenceThreshold) {
          patterns.push({
            type: 'sandwich',
            confidence,
            profit,
            transactions: [frontTx, victimTx, backTx],
            metadata: {
              frontChange,
              victimChange,
              backChange
            }
          });
        }
      }
    }

    return patterns;
  }

  /**
   * 检测抢跑交易
   */
  async detectFrontrunning(
    blockNumber: number,
    transactions: string[]
  ): Promise<MEVPattern[]> {
    const patterns: MEVPattern[] = [];
    const liquidityChanges = await this.liquidityAnalyzer.getBlockLiquidityChanges(
      blockNumber
    );

    for (let i = 0; i < transactions.length - 1; i++) {
      const frontTx = transactions[i];
      const targetTx = transactions[i + 1];

      const frontChange = liquidityChanges.get(frontTx);
      const targetChange = liquidityChanges.get(targetTx);

      if (!frontChange || !targetChange) {
        continue;
      }

      const profit = this.calculateFrontrunningProfit(
        frontChange,
        targetChange
      );

      if (profit > this.config.minProfitThreshold) {
        const confidence = this.calculateFrontrunningConfidence(
          frontChange,
          targetChange
        );

        if (confidence >= this.config.confidenceThreshold) {
          patterns.push({
            type: 'frontrunning',
            confidence,
            profit,
            transactions: [frontTx, targetTx],
            metadata: {
              frontChange,
              targetChange
            }
          });
        }
      }
    }

    return patterns;
  }

  /**
   * 检测套利交易
   */
  async detectArbitrage(
    blockNumber: number,
    transactions: string[]
  ): Promise<MEVPattern[]> {
    const patterns: MEVPattern[] = [];
    const liquidityChanges = await this.liquidityAnalyzer.getBlockLiquidityChanges(
      blockNumber
    );

    for (const tx of transactions) {
      const changes = liquidityChanges.get(tx);
      if (!changes) {
        continue;
      }

      const profit = this.calculateArbitrageProfit(changes);
      if (profit > this.config.minProfitThreshold) {
        const confidence = this.calculateArbitrageConfidence(changes);

        if (confidence >= this.config.confidenceThreshold) {
          patterns.push({
            type: 'arbitrage',
            confidence,
            profit,
            transactions: [tx],
            metadata: {
              changes
            }
          });
        }
      }
    }

    return patterns;
  }

  /**
   * 分析区块范围内的 MEV 活动
   */
  async analyzeBlockRange(
    startBlock: number,
    endBlock: number
  ): Promise<Map<number, MEVPattern[]>> {
    if (endBlock - startBlock > this.config.maxBlockRange) {
      throw new MEVError(
        `Block range exceeds maximum of ${this.config.maxBlockRange}`
      );
    }

    const results = new Map<number, MEVPattern[]>();

    for (let block = startBlock; block <= endBlock; block++) {
      const transactions = await this.liquidityAnalyzer.getBlockTransactions(block);
      
      const patterns = [
        ...(await this.detectSandwichAttacks(block, transactions)),
        ...(await this.detectFrontrunning(block, transactions)),
        ...(await this.detectArbitrage(block, transactions))
      ];

      if (patterns.length > 0) {
        results.set(block, patterns);
      }
    }

    return results;
  }

  /**
   * 计算三明治攻击的利润
   */
  private calculateSandwichProfit(
    frontChange: LiquidityChange,
    victimChange: LiquidityChange,
    backChange: LiquidityChange
  ): bigint {
    return this.calculator.calculateSandwichProfit(
      frontChange,
      victimChange,
      backChange
    );
  }

  /**
   * 计算三明治攻击的置信度
   */
  private calculateSandwichConfidence(
    frontChange: LiquidityChange,
    victimChange: LiquidityChange,
    backChange: LiquidityChange
  ): number {
    return this.calculator.calculateSandwichConfidence(
      frontChange,
      victimChange,
      backChange
    );
  }

  /**
   * 计算抢跑交易的利润
   */
  private calculateFrontrunningProfit(
    frontChange: LiquidityChange,
    targetChange: LiquidityChange
  ): bigint {
    return this.calculator.calculateFrontrunningProfit(
      frontChange,
      targetChange
    );
  }

  /**
   * 计算抢跑交易的置信度
   */
  private calculateFrontrunningConfidence(
    frontChange: LiquidityChange,
    targetChange: LiquidityChange
  ): number {
    return this.calculator.calculateFrontrunningConfidence(
      frontChange,
      targetChange
    );
  }

  /**
   * 计算套利交易的利润
   */
  private calculateArbitrageProfit(changes: LiquidityChange): bigint {
    return this.calculator.calculateArbitrageProfit(changes);
  }

  /**
   * 计算套利交易的置信度
   */
  private calculateArbitrageConfidence(changes: LiquidityChange): number {
    return this.calculator.calculateArbitrageConfidence(changes);
  }
} 