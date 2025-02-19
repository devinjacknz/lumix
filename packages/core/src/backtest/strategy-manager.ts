import { logger } from '../monitoring';
import { Strategy, StrategyConfig, MarketState, PositionState, Signal } from './strategy';
import { StrategyType } from './types';
import { TrendFollowingStrategy } from './strategies/trend-following';

export class StrategyManager {
  private strategies: Map<string, Strategy> = new Map();
  private activeStrategies: Set<string> = new Set();

  // 注册策略
  public async registerStrategy(config: StrategyConfig): Promise<void> {
    try {
      // 创建策略实例
      const strategy = this.createStrategy(config.type);
      
      // 初始化策略
      await strategy.initialize(config);
      
      // 验证策略
      if (!strategy.validate()) {
        throw new Error(`Strategy validation failed: ${config.name}`);
      }

      // 保存策略
      this.strategies.set(config.name, strategy);
      logger.info('StrategyManager', `Registered strategy: ${config.name}`, {
        type: config.type
      });
    } catch (error) {
      logger.error('StrategyManager', `Failed to register strategy: ${config.name}`, {
        error
      });
      throw error;
    }
  }

  // 激活策略
  public activateStrategy(name: string): void {
    if (!this.strategies.has(name)) {
      throw new Error(`Strategy not found: ${name}`);
    }
    this.activeStrategies.add(name);
    logger.info('StrategyManager', `Activated strategy: ${name}`);
  }

  // 停用策略
  public deactivateStrategy(name: string): void {
    this.activeStrategies.delete(name);
    logger.info('StrategyManager', `Deactivated strategy: ${name}`);
  }

  // 获取策略
  public getStrategy(name: string): Strategy | undefined {
    return this.strategies.get(name);
  }

  // 获取所有策略
  public getAllStrategies(): Strategy[] {
    return Array.from(this.strategies.values());
  }

  // 获取活跃策略
  public getActiveStrategies(): Strategy[] {
    return Array.from(this.activeStrategies)
      .map(name => this.strategies.get(name))
      .filter((strategy): strategy is Strategy => strategy !== undefined);
  }

  // 更新市场状态
  public async updateMarketState(state: MarketState): Promise<void> {
    try {
      const strategies = this.getActiveStrategies();
      
      // 更新每个活跃策略的市场状态
      for (const strategy of strategies) {
        await strategy.analyzeMarket(state);
      }

      logger.debug('StrategyManager', 'Updated market state', {
        strategies: strategies.length,
        timestamp: state.timestamp
      });
    } catch (error) {
      logger.error('StrategyManager', 'Failed to update market state', { error });
      throw error;
    }
  }

  // 生成交易信号
  public async generateSignals(
    state: MarketState,
    positions: PositionState[]
  ): Promise<Signal[]> {
    try {
      const signals: Signal[] = [];
      const strategies = this.getActiveStrategies();

      // 从每个活跃策略获取信号
      for (const strategy of strategies) {
        const strategySignals = await strategy.generateSignals(state, positions);
        
        // 验证信号
        for (const signal of strategySignals) {
          if (await strategy.validateSignal(signal, state)) {
            signals.push(signal);
          }
        }
      }

      logger.debug('StrategyManager', 'Generated signals', {
        count: signals.length,
        timestamp: state.timestamp
      });

      return signals;
    } catch (error) {
      logger.error('StrategyManager', 'Failed to generate signals', { error });
      return [];
    }
  }

  // 获取策略统计信息
  public getStrategyStatistics(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, strategy] of this.strategies) {
      stats[name] = {
        type: strategy.getType(),
        active: this.activeStrategies.has(name),
        stats: strategy.getStatistics()
      };
    }

    return stats;
  }

  // 重置所有策略
  public reset(): void {
    for (const strategy of this.strategies.values()) {
      strategy.reset();
    }
    this.activeStrategies.clear();
    logger.info('StrategyManager', 'Reset all strategies');
  }

  // 创建策略实例
  private createStrategy(type: StrategyType): Strategy {
    switch (type) {
      case StrategyType.TREND_FOLLOWING:
        return new TrendFollowingStrategy();
      // TODO: 添加其他策略类型
      default:
        throw new Error(`Unsupported strategy type: ${type}`);
    }
  }
} 