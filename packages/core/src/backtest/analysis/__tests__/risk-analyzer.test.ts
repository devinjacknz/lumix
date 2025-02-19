import { RiskAnalyzer } from '../risk-analyzer';
import { BacktestResult } from '../../types';

describe('RiskAnalyzer', () => {
  // 测试数据
  const mockBacktestResult: BacktestResult = {
    config: {} as any,
    startTime: new Date('2024-01-01'),
    endTime: new Date('2024-03-31'),
    duration: 7776000000, // 90天

    metrics: {
      totalReturns: '0.25',
      annualizedReturns: '1.0',
      maxDrawdown: '0.1',
      volatility: '0.2',
      sharpeRatio: '2.5',
      sortinoRatio: '3.0',
      calmarRatio: '10.0',
      alpha: '0.05',
      beta: '0.8',
      informationRatio: '1.5'
    },

    trades: {
      total: 100,
      winning: 60,
      losing: 40,
      winRate: '0.6',
      avgWin: '0.02',
      avgLoss: '0.01',
      largestWin: '0.05',
      largestLoss: '0.03',
      profitFactor: '2.0',
      avgDuration: 86400, // 1天
      avgMAE: '0.01',
      avgMFE: '0.02'
    },

    positions: {
      total: 10,
      avgSize: '1000',
      avgLeverage: '1',
      avgHoldingPeriod: 86400,
      maxConcurrent: 5
    },

    capital: {
      initial: '10000',
      final: '12500',
      peak: '13000',
      valley: '9500',
      avgUtilization: '0.8'
    },

    risk: {
      valueAtRisk: '0.02',
      expectedShortfall: '0.03',
      tailRatio: '0.5',
      downside: '0.15'
    },

    timeSeries: {
      equity: Array.from({ length: 90 }, (_, i) => ({
        timestamp: new Date(Date.UTC(2024, 0, i + 1)),
        value: (10000 * (1 + i * 0.003)).toString()
      })),
      drawdown: Array.from({ length: 90 }, (_, i) => ({
        timestamp: new Date(Date.UTC(2024, 0, i + 1)),
        value: (0.1 * Math.sin(i * Math.PI / 45)).toString()
      })),
      returns: Array.from({ length: 90 }, (_, i) => ({
        timestamp: new Date(Date.UTC(2024, 0, i + 1)),
        value: (0.003 + 0.001 * Math.sin(i * Math.PI / 45)).toString()
      })),
      positions: Array.from({ length: 90 }, (_, i) => ({
        timestamp: new Date(Date.UTC(2024, 0, i + 1)),
        value: Math.floor(Math.random() * 5 + 1).toString()
      }))
    }
  };

  describe('Risk Metrics', () => {
    const analyzer = new RiskAnalyzer();

    test('should calculate VaR correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证VaR计算
      expect(analysis.metrics.valueAtRisk.daily).toBeGreaterThan(0);
      expect(analysis.metrics.valueAtRisk.weekly).toBeGreaterThan(0);
      expect(analysis.metrics.valueAtRisk.monthly).toBeGreaterThan(0);
      expect(analysis.metrics.valueAtRisk.parametric).toBeGreaterThan(0);
      expect(analysis.metrics.valueAtRisk.historical).toBeGreaterThan(0);
      expect(analysis.metrics.valueAtRisk.monteCarlo).toBeGreaterThan(0);
    });

    test('should calculate Expected Shortfall correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证ES计算
      expect(analysis.metrics.expectedShortfall.daily).toBeGreaterThan(0);
      expect(analysis.metrics.expectedShortfall.weekly).toBeGreaterThan(0);
      expect(analysis.metrics.expectedShortfall.monthly).toBeGreaterThan(0);
    });

    test('should calculate drawdown metrics correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证回撤指标
      expect(analysis.metrics.drawdown.maximum).toBeGreaterThan(0);
      expect(analysis.metrics.drawdown.average).toBeGreaterThan(0);
      expect(analysis.metrics.drawdown.duration).toBeGreaterThan(0);
      expect(analysis.metrics.drawdown.recovery).toBeGreaterThan(0);
    });

    test('should calculate volatility metrics correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证波动率指标
      expect(analysis.metrics.volatility.historical).toBeGreaterThan(0);
      expect(analysis.metrics.volatility.implied).toBeGreaterThan(0);
      expect(analysis.metrics.volatility.garch).toBeGreaterThan(0);
      expect(analysis.metrics.volatility.parkinson).toBeGreaterThan(0);
    });
  });

  describe('Stress Testing', () => {
    const analyzer = new RiskAnalyzer({
      stressScenarios: [
        {
          name: 'Market Crash',
          shocks: {
            returns: -0.2,
            volatility: 2,
            correlation: 0.8
          }
        }
      ]
    });

    test('should perform stress tests correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证压力测试结果
      expect(analysis.stressTest.length).toBe(1);
      expect(analysis.stressTest[0].scenario).toBe('Market Crash');
      expect(analysis.stressTest[0].impact.returns).toBeLessThan(0);
      expect(analysis.stressTest[0].impact.drawdown).toBeGreaterThan(0);
      expect(analysis.stressTest[0].impact.var).toBeGreaterThan(0);
      expect(analysis.stressTest[0].recovery.time).toBeGreaterThan(0);
      expect(analysis.stressTest[0].recovery.path.length).toBeGreaterThan(0);
    });
  });

  describe('Sensitivity Analysis', () => {
    const analyzer = new RiskAnalyzer();

    test('should calculate sensitivity measures correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证敏感性指标
      expect(analysis.sensitivity.delta).toBeDefined();
      expect(analysis.sensitivity.gamma).toBeDefined();
      expect(analysis.sensitivity.vega).toBeDefined();
      expect(analysis.sensitivity.theta).toBeDefined();
      expect(analysis.sensitivity.rho).toBeDefined();
    });
  });

  describe('Concentration Risk', () => {
    const analyzer = new RiskAnalyzer();

    test('should analyze concentration risk correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证集中度风险
      expect(analysis.concentration.asset).toBeGreaterThan(0);
      expect(analysis.concentration.sector).toBeGreaterThan(0);
      expect(analysis.concentration.strategy).toBeGreaterThan(0);
      expect(analysis.concentration.herfindahl).toBeGreaterThan(0);
    });
  });

  describe('Liquidity Risk', () => {
    const analyzer = new RiskAnalyzer();

    test('should analyze liquidity risk correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证流动性风险
      expect(analysis.liquidity.turnover).toBeGreaterThan(0);
      expect(analysis.liquidity.volumeRatio).toBeGreaterThan(0);
      expect(analysis.liquidity.spreadCost).toBeGreaterThan(0);
      expect(analysis.liquidity.slippageImpact).toBeGreaterThan(0);
    });
  });

  describe('Tail Risk', () => {
    const analyzer = new RiskAnalyzer();

    test('should analyze tail risk correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证尾部风险
      expect(analysis.tail.skewness).toBeDefined();
      expect(analysis.tail.kurtosis).toBeDefined();
      expect(analysis.tail.tailRatio).toBeGreaterThan(0);
      expect(analysis.tail.extremeEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Risk Decomposition', () => {
    const analyzer = new RiskAnalyzer();

    test('should decompose risk correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证风险分解
      expect(analysis.decomposition.systematic).toBeGreaterThan(0);
      expect(analysis.decomposition.specific).toBeGreaterThan(0);
      expect(Object.keys(analysis.decomposition.factors).length).toBeGreaterThan(0);
    });
  });

  describe('Risk Warnings', () => {
    const analyzer = new RiskAnalyzer({
      riskLimits: {
        maxDrawdown: 0.05,
        maxLeverage: 1.5,
        maxConcentration: 0.2,
        maxVar: 0.05
      }
    });

    test('should generate risk warnings correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证风险预警
      expect(analysis.warnings.length).toBeGreaterThan(0);
      analysis.warnings.forEach(warning => {
        expect(warning.type).toBeDefined();
        expect(warning.level).toBeDefined();
        expect(warning.message).toBeDefined();
        expect(warning.threshold).toBeDefined();
        expect(warning.current).toBeDefined();
        expect(warning.timestamp).toBeDefined();
      });
    });
  });

  describe('Configuration Options', () => {
    test('should respect confidence level setting', () => {
      const analyzer1 = new RiskAnalyzer({ confidenceLevel: 0.95 });
      const analyzer2 = new RiskAnalyzer({ confidenceLevel: 0.99 });
      
      const analysis1 = analyzer1.analyze(mockBacktestResult);
      const analysis2 = analyzer2.analyze(mockBacktestResult);
      
      expect(analysis1.metrics.valueAtRisk.daily)
        .toBeLessThan(analysis2.metrics.valueAtRisk.daily);
    });

    test('should handle different time horizons', () => {
      const analyzer1 = new RiskAnalyzer({ timeHorizon: 1 });
      const analyzer2 = new RiskAnalyzer({ timeHorizon: 0.25 });
      
      const analysis1 = analyzer1.analyze(mockBacktestResult);
      const analysis2 = analyzer2.analyze(mockBacktestResult);
      
      expect(analysis1.metrics.valueAtRisk.monthly)
        .not.toBe(analysis2.metrics.valueAtRisk.monthly);
    });
  });

  describe('Error Handling', () => {
    const analyzer = new RiskAnalyzer();

    test('should handle empty return series', () => {
      const emptyResult = {
        ...mockBacktestResult,
        timeSeries: {
          ...mockBacktestResult.timeSeries,
          returns: []
        }
      };
      
      expect(() => analyzer.analyze(emptyResult)).toThrow();
    });

    test('should handle invalid return values', () => {
      const invalidResult = {
        ...mockBacktestResult,
        timeSeries: {
          ...mockBacktestResult.timeSeries,
          returns: [
            {
              timestamp: new Date(),
              value: 'invalid'
            }
          ]
        }
      };
      
      expect(() => analyzer.analyze(invalidResult)).toThrow();
    });
  });
}); 