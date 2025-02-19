import * as BigNumber from '../utils/bignumber';
import { logger } from '../monitoring';
import { ChainProtocol } from '../chain/abstract';
import { MarketAnalyzer, MarketMetrics, MarketSignal } from './market-analyzer';

export interface StrategyConfig {
  name: string;
  description: string;
  type: 'arbitrage' | 'market-making' | 'trend-following' | 'mean-reversion';
  parameters: Record<string, any>;
  constraints: {
    maxRiskPerTrade: number;
    maxDrawdown: number;
    minProfitTarget: number;
    maxPositionSize: number;
  };
}

export interface StrategyPerformance {
  returns: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  recoveryFactor: number;
}

export interface OptimizationResult {
  optimizedParams: Record<string, any>;
  expectedPerformance: StrategyPerformance;
  confidence: number;
  recommendations: string[];
}

export interface BacktestResult {
  trades: Array<{
    timestamp: number;
    type: 'entry' | 'exit';
    price: number;
    size: number;
    pnl: number;
  }>;
  performance: StrategyPerformance;
  metrics: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    averageWin: number;
    averageLoss: number;
  };
}

export interface Strategy {
  id: string;
  parameters: {
    entryThreshold: bigint;
    exitThreshold: bigint;
    stopLoss: bigint;
    takeProfit: bigint;
    maxPositionSize: bigint;
    leverageRatio: number;
  };
  performance: {
    returns: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
  };
}

export interface OptimizationConfig {
  populationSize: number;
  generations: number;
  mutationRate: number;
  crossoverRate: number;
  objectives: {
    returns: number;
    risk: number;
    stability: number;
  };
}

export class StrategyOptimizer {
  private strategies: Strategy[] = [];
  private bestStrategy: Strategy | null = null;
  private marketAnalyzer: MarketAnalyzer;
  private historicalData: any;

  constructor(
    private config: OptimizationConfig,
    marketAnalyzer: MarketAnalyzer,
    historicalData: any
  ) {
    this.marketAnalyzer = marketAnalyzer;
    this.historicalData = historicalData;
  }

  async optimizeStrategy(
    initialStrategy: Strategy,
    marketData: any[]
  ): Promise<Strategy> {
    this.strategies = this.initializePopulation(initialStrategy);
    
    for (let gen = 0; gen < this.config.generations; gen++) {
      // 评估每个策略
      for (const strategy of this.strategies) {
        const performance = await this.evaluateStrategy(strategy, marketData);
        strategy.performance = performance;
      }

      // 选择最佳策略
      this.strategies.sort((a, b) => this.calculateFitness(b) - this.calculateFitness(a));
      this.bestStrategy = this.strategies[0];

      // 记录优化进度
      logger.info('Optimizer', `Generation ${gen + 1}/${this.config.generations}: Best fitness = ${this.calculateFitness(this.bestStrategy)}`);

      // 创建下一代
      this.evolvePopulation();
    }

    return this.bestStrategy || initialStrategy;
  }

  private initializePopulation(initial: Strategy): Strategy[] {
    const population: Strategy[] = [initial];
    
    for (let i = 1; i < this.config.populationSize; i++) {
      population.push(this.mutateStrategy(initial));
    }

    return population;
  }

  private async evaluateStrategy(
    strategy: Strategy,
    marketData: any[]
  ): Promise<Strategy['performance']> {
    // 模拟策略执行并计算性能指标
    const returns = this.calculateReturns(strategy, marketData);
    const sharpeRatio = this.calculateSharpeRatio(returns);
    const maxDrawdown = this.calculateMaxDrawdown(returns);
    const winRate = this.calculateWinRate(returns);

    return {
      returns,
      sharpeRatio,
      maxDrawdown,
      winRate
    };
  }

  private calculateFitness(strategy: Strategy): number {
    const { objectives } = this.config;
    
    return (
      strategy.performance.returns * objectives.returns +
      (1 - strategy.performance.maxDrawdown) * objectives.risk +
      strategy.performance.sharpeRatio * objectives.stability
    ) / Object.values(objectives).reduce((a, b) => a + b, 0);
  }

  private mutateStrategy(strategy: Strategy): Strategy {
    const mutated: Strategy = {
      ...strategy,
      parameters: {
        entryThreshold: this.mutateValue(strategy.parameters.entryThreshold),
        exitThreshold: this.mutateValue(strategy.parameters.exitThreshold),
        stopLoss: this.mutateValue(strategy.parameters.stopLoss),
        takeProfit: this.mutateValue(strategy.parameters.takeProfit),
        maxPositionSize: this.mutateValue(strategy.parameters.maxPositionSize),
        leverageRatio: this.mutateNumber(strategy.parameters.leverageRatio),
      },
      performance: { ...strategy.performance }
    };

    // 验证参数约束
    if (BigNumber.lt(mutated.parameters.stopLoss, 0n)) {
      mutated.parameters.stopLoss = 0n;
    }

    if (BigNumber.lt(mutated.parameters.takeProfit, mutated.parameters.entryThreshold)) {
      mutated.parameters.takeProfit = mutated.parameters.entryThreshold;
    }

    return mutated;
  }

  private mutateValue(value: bigint): bigint {
    if (Math.random() < this.config.mutationRate) {
      const change = BigNumber.toBigInt(Math.floor(Math.random() * 20 - 10)); // -10 到 +10 的随机变化
      return BigNumber.add(value, change);
    }
    return value;
  }

  private mutateNumber(value: number): number {
    if (Math.random() < this.config.mutationRate) {
      const change = (Math.random() * 0.4 - 0.2); // -20% 到 +20% 的随机变化
      return Math.max(0, value + value * change);
    }
    return value;
  }

  private evolvePopulation() {
    const newPopulation: Strategy[] = [this.bestStrategy!];

    while (newPopulation.length < this.config.populationSize) {
      if (Math.random() < this.config.crossoverRate) {
        // 交叉
        const parent1 = this.selectParent();
        const parent2 = this.selectParent();
        const child = this.crossover(parent1, parent2);
        newPopulation.push(child);
      } else {
        // 变异
        const parent = this.selectParent();
        const child = this.mutateStrategy(parent);
        newPopulation.push(child);
      }
    }

    this.strategies = newPopulation;
  }

  private selectParent(): Strategy {
    // 锦标赛选择
    const tournamentSize = 3;
    let best = this.strategies[Math.floor(Math.random() * this.strategies.length)];
    
    for (let i = 1; i < tournamentSize; i++) {
      const candidate = this.strategies[Math.floor(Math.random() * this.strategies.length)];
      if (this.calculateFitness(candidate) > this.calculateFitness(best)) {
        best = candidate;
      }
    }

    return best;
  }

  private crossover(parent1: Strategy, parent2: Strategy): Strategy {
    return {
      ...parent1,
      parameters: {
        entryThreshold: Math.random() < 0.5 ? parent1.parameters.entryThreshold : parent2.parameters.entryThreshold,
        exitThreshold: Math.random() < 0.5 ? parent1.parameters.exitThreshold : parent2.parameters.exitThreshold,
        stopLoss: Math.random() < 0.5 ? parent1.parameters.stopLoss : parent2.parameters.stopLoss,
        takeProfit: Math.random() < 0.5 ? parent1.parameters.takeProfit : parent2.parameters.takeProfit,
        maxPositionSize: Math.random() < 0.5 ? parent1.parameters.maxPositionSize : parent2.parameters.maxPositionSize,
        leverageRatio: Math.random() < 0.5 ? parent1.parameters.leverageRatio : parent2.parameters.leverageRatio,
      },
      performance: { ...parent1.performance }
    };
  }

  private calculateReturns(strategy: Strategy, marketData: any[]): number {
    // 简单的回测实现
    return Math.random() * 100; // 示例实现
  }

  private calculateSharpeRatio(returns: number): number {
    // 示例实现
    return returns / (Math.random() * 10 + 5);
  }

  private calculateMaxDrawdown(returns: number): number {
    // 示例实现
    return Math.random() * 0.3;
  }

  private calculateWinRate(returns: number): number {
    // 示例实现
    return Math.random() * 0.4 + 0.3;
  }

  // 获取策略性能指标
  getStrategyPerformance(strategyName: string): StrategyPerformance | undefined {
    const strategy = this.strategies.find(s => s.id === strategyName);
    return strategy?.performance;
  }

  // 注册新策略
  registerStrategy(strategy: Strategy) {
    this.strategies.push(strategy);
  }

  // 获取所有已注册策略
  getRegisteredStrategies(): Strategy[] {
    return this.strategies;
  }
} 