import { BaseError } from '@lumix/core';
import { LiquidityAnalyzer } from '@lumix/plugin-defi-crawler';
import { MEVDetector, MEVPattern, MEVDetectionConfig } from './mev/detector';
import { MEVCalculator, LiquidityChange } from './mev/calculator';

export class ChainAnalyzerError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ChainAnalyzerError';
  }
}

export interface AnalyzerConfig {
  chainId: number;
  liquidityAnalyzer: LiquidityAnalyzer;
  mev?: {
    minProfitThreshold?: bigint;
    maxBlockRange?: number;
    confidenceThreshold?: number;
  };
}

export class ChainAnalyzer {
  private config: Required<AnalyzerConfig>;
  private mevDetector: MEVDetector;

  constructor(config: AnalyzerConfig) {
    this.config = {
      chainId: config.chainId,
      liquidityAnalyzer: config.liquidityAnalyzer,
      mev: {
        minProfitThreshold: config.mev?.minProfitThreshold || BigInt(1e18), // 1 ETH
        maxBlockRange: config.mev?.maxBlockRange || 100,
        confidenceThreshold: config.mev?.confidenceThreshold || 0.8
      }
    };

    // 初始化 MEV 检测器
    this.mevDetector = new MEVDetector({
      minProfitThreshold: this.config.mev.minProfitThreshold,
      maxBlockRange: this.config.mev.maxBlockRange,
      confidenceThreshold: this.config.mev.confidenceThreshold,
      liquidityAnalyzer: this.config.liquidityAnalyzer
    });
  }

  /**
   * 分析指定区块范围内的 MEV 活动
   */
  async analyzeMEV(
    startBlock: number,
    endBlock: number
  ): Promise<Map<number, MEVPattern[]>> {
    try {
      return await this.mevDetector.analyzeBlockRange(startBlock, endBlock);
    } catch (error) {
      throw new ChainAnalyzerError('Failed to analyze MEV activities', {
        cause: error
      });
    }
  }

  /**
   * 获取 MEV 检测器实例
   */
  getMEVDetector(): MEVDetector {
    return this.mevDetector;
  }
}

// 导出所有相关类型和类
export {
  MEVPattern,
  MEVDetectionConfig,
  MEVDetector,
  MEVCalculator,
  LiquidityChange
}; 