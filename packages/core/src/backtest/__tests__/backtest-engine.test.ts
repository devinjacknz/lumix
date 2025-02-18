import { BacktestEngine } from '../backtest-engine';
import { 
  BacktestConfig,
  TimeResolution,
  DataSourceType,
  StrategyType
} from '../types';

describe('BacktestEngine', () => {
  // 测试配置
  const config: BacktestConfig = {
    startTime: new Date('2024-01-01'),
    endTime: new Date('2024-03-31'),
    initialCapital: '10000',
    chains: ['ethereum'],
    tokens: ['WETH'],
    maxPositionSize: '1000',
    maxDrawdown: 0.2,
    slippageTolerance: 0.01,
    gasMultiplier: 1.1,
    dataResolution: TimeResolution.HOUR_1,
    dataSource: DataSourceType.HISTORICAL,
    cacheData: true,
    strategy: {
      name: 'test_strategy',
      type: StrategyType.TREND_FOLLOWING,
      parameters: {},
      constraints: {
        minOrderSize: '100',
        maxOrderSize: '1000',
        minInterval: 3600,
        maxPositions: 5,
        allowedTransactionTypes: ['entry', 'exit']
      }
    },
    riskManagement: {
      stopLoss: {
        enabled: true,
        type: 'fixed',
        value: 0.05
      },
      takeProfit: {
        enabled: true,
        type: 'fixed',
        value: 0.1
      },
      positionSizing: {
        type: 'fixed',
        value: 0.1
      },
      riskPerTrade: 0.02,
      maxDrawdown: 0.2,
      maxLeverage: 1
    },
    performanceMetrics: []
  };

  describe('Standard Backtest', () => {
    let engine: BacktestEngine;

    beforeEach(() => {
      engine = new BacktestEngine(config);
    });

    test('should run backtest successfully', async () => {
      const result = await engine.run();
      
      // 验证结果结构
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('trades');
      expect(result).toHaveProperty('positions');
      expect(result).toHaveProperty('capital');
      expect(result).toHaveProperty('risk');
      expect(result).toHaveProperty('timeSeries');

      // 验证时间范围
      expect(result.startTime).toEqual(config.startTime);
      expect(result.endTime).toEqual(config.endTime);

      // 验证资金变化
      expect(Number(result.capital.initial)).toBe(Number(config.initialCapital));
      expect(Number(result.capital.final)).toBeGreaterThan(0);
    });

    test('should handle risk management', async () => {
      const result = await engine.run();
      
      // 验证风险指标
      expect(Number(result.metrics.maxDrawdown)).toBeLessThanOrEqual(config.maxDrawdown);
      expect(result.metrics.sharpeRatio).toBeDefined();
      expect(result.metrics.sortinoRatio).toBeDefined();
    });

    test('should respect position constraints', async () => {
      const result = await engine.run();
      
      // 验证持仓限制
      expect(result.positions.maxConcurrent).toBeLessThanOrEqual(
        config.strategy.constraints.maxPositions
      );

      // 验证仓位大小
      result.trades.total > 0 && expect(
        Number(result.positions.avgSize)
      ).toBeLessThanOrEqual(
        Number(config.maxPositionSize)
      );
    });
  });

  describe('Parallel Backtest', () => {
    const parallelConfig: BacktestConfig = {
      ...config,
      chains: ['ethereum', 'base'],
      tokens: ['WETH', 'USDC']
    };

    test('should run parallel backtest successfully', async () => {
      const engine = new BacktestEngine(parallelConfig);
      const result = await engine.run();
      
      // 验证多资产结果
      expect(result.trades.total).toBeGreaterThan(0);
      expect(result.positions.total).toBeGreaterThan(0);
    });
  });

  describe('Event-Driven Backtest', () => {
    const eventDrivenConfig: BacktestConfig = {
      ...config,
      strategy: {
        ...config.strategy,
        type: StrategyType.CUSTOM
      }
    };

    test('should run event-driven backtest successfully', async () => {
      const engine = new BacktestEngine(eventDrivenConfig);
      const result = await engine.run();
      
      // 验证事件处理
      expect(result.trades.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Monte Carlo Simulation', () => {
    test('should run Monte Carlo simulation successfully', async () => {
      const engine = new BacktestEngine(config);
      const { results, statistics } = await engine.runMonteCarloSimulation(100);
      
      // 验证模拟结果
      expect(results.length).toBe(100);
      expect(statistics.mean).toBeDefined();
      expect(statistics.std).toBeDefined();
      expect(statistics.var).toBeDefined();
      expect(statistics.cvar).toBeDefined();

      // 验证统计量的合理性
      expect(statistics.mean).toBeGreaterThan(-1);
      expect(statistics.std).toBeGreaterThan(0);
      expect(statistics.var).toBeLessThan(0);
      expect(statistics.cvar).toBeLessThan(statistics.var);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid configuration', () => {
      const invalidConfig = {
        ...config,
        startTime: new Date('2024-03-31'),
        endTime: new Date('2024-01-01')
      };

      expect(() => new BacktestEngine(invalidConfig)).toThrow();
    });

    test('should handle missing market data', async () => {
      const engine = new BacktestEngine({
        ...config,
        startTime: new Date('2020-01-01'),
        endTime: new Date('2020-03-31')
      });

      await expect(engine.run()).rejects.toThrow();
    });

    test('should handle strategy errors', async () => {
      const engine = new BacktestEngine({
        ...config,
        strategy: {
          ...config.strategy,
          parameters: { invalidParam: true }
        }
      });

      await expect(engine.run()).rejects.toThrow();
    });
  });

  describe('Performance Monitoring', () => {
    test('should emit state updates', async () => {
      const engine = new BacktestEngine(config);
      const updates: any[] = [];

      engine.on('stateUpdate', (state) => {
        updates.push(state);
      });

      await engine.run();

      // 验证状态更新
      expect(updates.length).toBeGreaterThan(0);
      updates.forEach(update => {
        expect(update).toHaveProperty('timestamp');
        expect(update).toHaveProperty('equity');
        expect(update).toHaveProperty('drawdown');
        expect(update).toHaveProperty('returns');
      });
    });

    test('should clean up resources', async () => {
      const engine = new BacktestEngine(config);
      await engine.run();

      // 验证资源清理
      expect(engine.listenerCount('stateUpdate')).toBe(0);
    });
  });
}); 