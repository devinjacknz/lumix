import { logger } from '../monitoring';
import { Statistics } from '../analysis/statistics';
import { Indicators } from '../analysis/indicators';
import { PriceAnalyzer } from '../analysis/price-analyzer';
import { VolumeAnalyzer } from '../analysis/volume-analyzer';
import { PatternRecognizer } from '../analysis/pattern-recognizer';
import { ChainType } from '../config/types';
import {
  StrategyType,
  SignalType,
  TimeResolution,
  MarketData
} from './types';

// 策略配置接口
export interface StrategyConfig {
  name: string;
  type: StrategyType;
  parameters: Record<string, any>;
  constraints: {
    minOrderSize: string;
    maxOrderSize: string;
    minInterval: number;
    maxPositions: number;
    allowedChains: ChainType[];
    allowedTokens: string[];
  };
}

// 市场状态接口
export interface MarketState {
  timestamp: Date;
  chain: ChainType;
  token: string;
  data: MarketData;
  indicators: Record<string, number | number[]>;
  patterns: Array<{
    type: string;
    confidence: number;
  }>;
  trends: Array<{
    timeframe: string;
    direction: 'up' | 'down' | 'neutral';
    strength: number;
  }>;
}

// 持仓状态接口
export interface PositionState {
  chain: ChainType;
  token: string;
  side: 'long' | 'short';
  size: string;
  entryPrice: string;
  currentPrice: string;
  unrealizedPnL: string;
  openTime: Date;
  duration: number;
}

// 信号接口
export interface Signal {
  type: SignalType;
  timestamp: Date;
  chain: ChainType;
  token: string;
  action: 'open_long' | 'open_short' | 'close_long' | 'close_short' | 'adjust';
  size: string;
  price?: string;
  reason: string;
  confidence: number;
  metadata?: Record<string, any>;
}

// 策略接口
export interface Strategy {
  // 基本信息
  getName(): string;
  getType(): StrategyType;
  getDescription(): string;

  // 初始化和配置
  initialize(config: StrategyConfig): Promise<void>;
  validate(): boolean;
  
  // 市场分析
  analyzeMarket(state: MarketState): Promise<void>;
  getMarketView(): Record<string, any>;
  
  // 信号生成
  shouldEnterMarket(state: MarketState): Promise<boolean>;
  shouldExitMarket(state: MarketState, position: PositionState): Promise<boolean>;
  generateSignals(state: MarketState, positions: PositionState[]): Promise<Signal[]>;
  
  // 风险管理
  validateSignal(signal: Signal, state: MarketState): Promise<boolean>;
  calculatePositionSize(signal: Signal, state: MarketState): Promise<string>;
  
  // 性能统计
  getStatistics(): Record<string, any>;
  reset(): void;
}

// 基础策略类
export abstract class BaseStrategy implements Strategy {
  protected config: StrategyConfig;
  protected statistics: Statistics;
  protected indicators: Indicators;
  protected priceAnalyzer: PriceAnalyzer;
  protected volumeAnalyzer: VolumeAnalyzer;
  protected patternRecognizer: PatternRecognizer;
  
  protected marketView: Record<string, any> = {};
  protected stats: Record<string, any> = {};
  protected lastUpdateTime: Date | null = null;

  constructor() {
    this.statistics = new Statistics();
    this.indicators = new Indicators();
    this.priceAnalyzer = new PriceAnalyzer();
    this.volumeAnalyzer = new VolumeAnalyzer();
    this.patternRecognizer = new PatternRecognizer();
  }

  public getName(): string {
    return this.config.name;
  }

  public getType(): StrategyType {
    return this.config.type;
  }

  public abstract getDescription(): string;

  public async initialize(config: StrategyConfig): Promise<void> {
    try {
      // 验证配置
      this.validateConfig(config);
      this.config = config;

      // 初始化统计
      this.resetStatistics();

      logger.info('Strategy', `Initialized ${config.name}`, {
        type: config.type,
        parameters: config.parameters
      });
    } catch (error) {
      logger.error('Strategy', `Failed to initialize ${config.name}`, { error });
      throw error;
    }
  }

  public validate(): boolean {
    return true;
  }

  public async analyzeMarket(state: MarketState): Promise<void> {
    try {
      // 更新市场视图
      this.marketView = {
        timestamp: state.timestamp,
        chain: state.chain,
        token: state.token,
        price: state.data.close,
        indicators: state.indicators,
        patterns: state.patterns,
        trends: state.trends
      };

      // 更新时间
      this.lastUpdateTime = state.timestamp;

      logger.debug('Strategy', `Updated market view for ${state.chain}:${state.token}`, {
        timestamp: state.timestamp,
        price: state.data.close
      });
    } catch (error) {
      logger.error('Strategy', 'Failed to analyze market', { error });
      throw error;
    }
  }

  public getMarketView(): Record<string, any> {
    return this.marketView;
  }

  public abstract shouldEnterMarket(state: MarketState): Promise<boolean>;
  public abstract shouldExitMarket(state: MarketState, position: PositionState): Promise<boolean>;
  public abstract generateSignals(state: MarketState, positions: PositionState[]): Promise<Signal[]>;

  public async validateSignal(signal: Signal, state: MarketState): Promise<boolean> {
    try {
      // 验证基本参数
      if (!this.config.constraints.allowedChains.includes(signal.chain)) {
        return false;
      }
      if (!this.config.constraints.allowedTokens.includes(signal.token)) {
        return false;
      }

      // 验证订单大小
      const size = parseFloat(signal.size);
      if (size < parseFloat(this.config.constraints.minOrderSize) ||
          size > parseFloat(this.config.constraints.maxOrderSize)) {
        return false;
      }

      // 验证时间间隔
      if (this.lastUpdateTime) {
        const interval = state.timestamp.getTime() - this.lastUpdateTime.getTime();
        if (interval < this.config.constraints.minInterval) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Strategy', 'Failed to validate signal', {
        signal,
        error
      });
      return false;
    }
  }

  public async calculatePositionSize(signal: Signal, state: MarketState): Promise<string> {
    // 默认实现：使用信号中指定的大小
    return signal.size;
  }

  public getStatistics(): Record<string, any> {
    return this.stats;
  }

  public reset(): void {
    this.resetStatistics();
    this.marketView = {};
    this.lastUpdateTime = null;
  }

  // 保护方法
  protected validateConfig(config: StrategyConfig): void {
    if (!config.name) {
      throw new Error('Strategy name is required');
    }
    if (!config.type) {
      throw new Error('Strategy type is required');
    }
    if (!config.parameters) {
      throw new Error('Strategy parameters are required');
    }
    if (!config.constraints) {
      throw new Error('Strategy constraints are required');
    }

    // 验证约束条件
    const constraints = config.constraints;
    if (parseFloat(constraints.minOrderSize) <= 0) {
      throw new Error('Minimum order size must be positive');
    }
    if (parseFloat(constraints.maxOrderSize) <= 0) {
      throw new Error('Maximum order size must be positive');
    }
    if (parseFloat(constraints.maxOrderSize) < parseFloat(constraints.minOrderSize)) {
      throw new Error('Maximum order size must be greater than minimum order size');
    }
    if (constraints.minInterval < 0) {
      throw new Error('Minimum interval must be non-negative');
    }
    if (constraints.maxPositions <= 0) {
      throw new Error('Maximum positions must be positive');
    }
    if (constraints.allowedChains.length === 0) {
      throw new Error('At least one chain must be allowed');
    }
    if (constraints.allowedTokens.length === 0) {
      throw new Error('At least one token must be allowed');
    }
  }

  protected resetStatistics(): void {
    this.stats = {
      signals: {
        total: 0,
        entries: 0,
        exits: 0,
        adjustments: 0
      },
      performance: {
        winRate: 0,
        profitFactor: 0,
        averageReturn: 0,
        maxDrawdown: 0
      },
      risk: {
        sharpeRatio: 0,
        sortinoRatio: 0,
        beta: 0,
        alpha: 0
      }
    };
  }

  protected updateStatistics(signal: Signal, result?: any): void {
    // 更新信号统计
    this.stats.signals.total++;
    switch (signal.type) {
      case SignalType.ENTRY:
        this.stats.signals.entries++;
        break;
      case SignalType.EXIT:
        this.stats.signals.exits++;
        break;
      case SignalType.ADJUSTMENT:
        this.stats.signals.adjustments++;
        break;
    }

    // TODO: 更新性能统计
  }
} 