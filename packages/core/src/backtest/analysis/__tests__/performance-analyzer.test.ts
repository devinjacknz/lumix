import { PerformanceAnalyzer } from '../performance-analyzer';
import { BacktestResult } from '../../types';

describe('PerformanceAnalyzer', () => {
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

  describe('Basic Analysis', () => {
    const analyzer = new PerformanceAnalyzer();

    test('should analyze returns correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证收益指标
      expect(analysis.returns.total).toBeGreaterThan(0);
      expect(analysis.returns.annualized).toBeGreaterThan(0);
      expect(analysis.returns.cumulative.length).toBe(90);
      expect(analysis.returns.rolling.length).toBeGreaterThan(0);
    });

    test('should analyze risk-adjusted returns correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证风险调整收益
      expect(analysis.riskAdjusted.sharpeRatio).toBeGreaterThan(0);
      expect(analysis.riskAdjusted.sortinoRatio).toBeGreaterThan(0);
      expect(analysis.riskAdjusted.treynorRatio).toBeGreaterThan(0);
      expect(analysis.riskAdjusted.calmarRatio).toBeGreaterThan(0);
      expect(analysis.riskAdjusted.omega).toBeGreaterThan(0);
    });

    test('should analyze risk metrics correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证风险指标
      expect(analysis.risk.volatility).toBeGreaterThan(0);
      expect(analysis.risk.beta).toBeGreaterThan(0);
      expect(analysis.risk.drawdown.maximum).toBeGreaterThan(0);
      expect(analysis.risk.drawdown.duration).toBeGreaterThan(0);
      expect(analysis.risk.var).toBeGreaterThan(0);
      expect(analysis.risk.cvar).toBeGreaterThan(0);
    });
  });

  describe('Trading Analysis', () => {
    const analyzer = new PerformanceAnalyzer();

    test('should analyze trading statistics correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证交易统计
      expect(analysis.trading.totalTrades).toBe(100);
      expect(analysis.trading.winningTrades).toBe(60);
      expect(analysis.trading.losingTrades).toBe(40);
      expect(analysis.trading.winRate).toBe(0.6);
      expect(analysis.trading.profitFactor).toBeGreaterThan(1);
    });

    test('should analyze position metrics correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证持仓分析
      expect(analysis.positions.maxPositions).toBe(5);
      expect(analysis.positions.averagePositions).toBeGreaterThan(0);
      expect(analysis.positions.maxLeverage).toBeGreaterThanOrEqual(1);
      expect(analysis.positions.concentration).toBeGreaterThan(0);
    });
  });

  describe('Time Analysis', () => {
    const analyzer = new PerformanceAnalyzer();

    test('should analyze timing patterns correctly', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      
      // 验证时间分析
      expect(analysis.timing.bestMonth).toBeDefined();
      expect(analysis.timing.worstMonth).toBeDefined();
      expect(analysis.timing.monthlyStats.length).toBeGreaterThan(0);
      expect(analysis.timing.hourlyStats.length).toBeGreaterThan(0);
    });

    test('should handle different time periods', () => {
      const shortResult = {
        ...mockBacktestResult,
        timeSeries: {
          ...mockBacktestResult.timeSeries,
          returns: mockBacktestResult.timeSeries.returns.slice(0, 30)
        }
      };
      
      const analysis = analyzer.analyze(shortResult);
      expect(analysis.returns.monthly.length).toBeLessThan(
        mockBacktestResult.timeSeries.returns.length
      );
    });
  });

  describe('Configuration Options', () => {
    test('should respect risk-free rate setting', () => {
      const analyzer1 = new PerformanceAnalyzer({ riskFreeRate: 0.02 });
      const analyzer2 = new PerformanceAnalyzer({ riskFreeRate: 0.05 });
      
      const analysis1 = analyzer1.analyze(mockBacktestResult);
      const analysis2 = analyzer2.analyze(mockBacktestResult);
      
      expect(analysis1.riskAdjusted.sharpeRatio)
        .toBeGreaterThan(analysis2.riskAdjusted.sharpeRatio);
    });

    test('should handle benchmark returns', () => {
      const benchmarkReturns = Array.from(
        { length: 90 },
        () => 0.001
      );
      
      const analyzer = new PerformanceAnalyzer({
        benchmarkReturns
      });
      
      const analysis = analyzer.analyze(mockBacktestResult);
      expect(analysis.riskAdjusted.informationRatio).toBeDefined();
      expect(analysis.risk.beta).toBeDefined();
      expect(analysis.risk.alpha).toBeDefined();
    });

    test('should adjust for different time horizons', () => {
      const analyzer1 = new PerformanceAnalyzer({ timeHorizon: 1 });
      const analyzer2 = new PerformanceAnalyzer({ timeHorizon: 0.25 });
      
      const analysis1 = analyzer1.analyze(mockBacktestResult);
      const analysis2 = analyzer2.analyze(mockBacktestResult);
      
      expect(analysis1.returns.annualized)
        .not.toBe(analysis2.returns.annualized);
    });
  });

  describe('Error Handling', () => {
    const analyzer = new PerformanceAnalyzer();

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

    test('should handle missing benchmark returns gracefully', () => {
      const analysis = analyzer.analyze(mockBacktestResult);
      expect(analysis.riskAdjusted.informationRatio).toBe(0);
      expect(analysis.risk.beta).toBe(1);
      expect(analysis.risk.alpha).toBe(0);
    });
  });
}); 