import { AttributionAnalyzer } from '../attribution-analyzer';
import { BacktestResult } from '../../types';

describe('AttributionAnalyzer', () => {
  // 模拟回测结果
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
      avgDuration: 86400,
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

  // 模拟基准收益率
  const mockBenchmarkReturns = Array.from({ length: 90 }, () => 0.002);

  // 模拟因子收益率
  const mockFactorReturns = {
    momentum: Array.from({ length: 90 }, () => 0.001),
    value: Array.from({ length: 90 }, () => 0.0015),
    size: Array.from({ length: 90 }, () => 0.0012)
  };

  describe('Overall Attribution', () => {
    const analyzer = new AttributionAnalyzer({
      benchmarkReturns: mockBenchmarkReturns,
      factorReturns: mockFactorReturns
    });

    test('should calculate overall attribution correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证总体归因
      expect(result.overall.totalReturn).toBeDefined();
      expect(result.overall.activeReturn).toBeDefined();
      expect(result.overall.selectiveReturn).toBeDefined();
      expect(result.overall.factorReturn).toBeDefined();

      // 验证收益分解
      expect(
        result.overall.selectiveReturn + result.overall.factorReturn
      ).toBeCloseTo(result.overall.activeReturn, 5);
    });
  });

  describe('Time Series Attribution', () => {
    const analyzer = new AttributionAnalyzer({
      benchmarkReturns: mockBenchmarkReturns,
      factorReturns: mockFactorReturns
    });

    test('should calculate time series attribution correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证时间序列长度
      expect(result.timeSeries.returns.length).toBe(90);
      expect(result.timeSeries.attribution.length).toBe(90);

      // 验证归因分量
      result.timeSeries.attribution.forEach(attr => {
        expect(attr.date).toBeInstanceOf(Date);
        expect(attr.selective).toBeDefined();
        expect(attr.factor).toBeDefined();
        expect(attr.interaction).toBeDefined();
      });
    });
  });

  describe('Factor Attribution', () => {
    const analyzer = new AttributionAnalyzer({
      benchmarkReturns: mockBenchmarkReturns,
      factorReturns: mockFactorReturns
    });

    test('should calculate factor attribution correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证因子分析
      Object.entries(result.factors).forEach(([factor, analysis]) => {
        expect(analysis.exposure).toBeDefined();
        expect(analysis.contribution).toBeDefined();
        expect(analysis.tValue).toBeDefined();
        expect(analysis.significance).toBeDefined();
      });

      // 验证因子覆盖
      expect(Object.keys(result.factors)).toEqual(
        Object.keys(mockFactorReturns)
      );
    });
  });

  describe('Trading Attribution', () => {
    const analyzer = new AttributionAnalyzer({
      benchmarkReturns: mockBenchmarkReturns
    });

    test('should calculate trading attribution correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证交易归因
      expect(result.trading.timing).toBeDefined();
      expect(result.trading.execution).toBeDefined();
      expect(result.trading.cost).toBeDefined();
      expect(result.trading.total).toBeDefined();

      // 验证总贡献计算
      expect(result.trading.total).toBeCloseTo(
        result.trading.timing + result.trading.execution - result.trading.cost,
        5
      );
    });
  });

  describe('Risk Attribution', () => {
    const analyzer = new AttributionAnalyzer({
      benchmarkReturns: mockBenchmarkReturns
    });

    test('should calculate risk attribution correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证风险归因
      expect(result.risk.systematic).toBeDefined();
      expect(result.risk.specific).toBeDefined();
      expect(result.risk.total).toBeDefined();

      // 验证总风险分解
      expect(result.risk.total).toBeCloseTo(
        result.risk.systematic + result.risk.specific,
        5
      );
    });
  });

  describe('Performance Attribution', () => {
    const analyzer = new AttributionAnalyzer({
      benchmarkReturns: mockBenchmarkReturns
    });

    test('should calculate performance attribution correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证业绩归因
      expect(result.performance.information).toBeDefined();
      expect(result.performance.selection).toBeDefined();
      expect(result.performance.timing).toBeDefined();
      expect(result.performance.total).toBeDefined();

      // 验证总业绩分解
      expect(result.performance.total).toBeCloseTo(
        result.performance.information +
        result.performance.selection +
        result.performance.timing,
        5
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle empty returns', () => {
      const analyzer = new AttributionAnalyzer();
      const emptyResult = {
        ...mockBacktestResult,
        timeSeries: {
          ...mockBacktestResult.timeSeries,
          returns: []
        }
      };
      
      expect(() => analyzer.analyze(emptyResult)).toThrow();
    });

    test('should handle missing benchmark returns', () => {
      const analyzer = new AttributionAnalyzer();
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证基准缺失时的处理
      expect(result.overall.activeReturn).toBeDefined();
      expect(result.overall.selectiveReturn).toBeDefined();
      expect(result.overall.factorReturn).toBeDefined();
    });

    test('should handle invalid return values', () => {
      const analyzer = new AttributionAnalyzer();
      const invalidResult = {
        ...mockBacktestResult,
        timeSeries: {
          ...mockBacktestResult.timeSeries,
          returns: [{
            timestamp: new Date(),
            value: 'invalid'
          }]
        }
      };
      
      expect(() => analyzer.analyze(invalidResult)).toThrow();
    });
  });

  describe('Configuration Options', () => {
    test('should respect time horizon setting', () => {
      const analyzer = new AttributionAnalyzer({
        timeHorizon: 0.5,
        benchmarkReturns: mockBenchmarkReturns
      });
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证时间周期影响
      expect(result.timeSeries.attribution[0].date.getTime())
        .toBeLessThan(result.timeSeries.attribution[1].date.getTime());
    });

    test('should handle rolling window setting', () => {
      const analyzer = new AttributionAnalyzer({
        rollingWindow: 10,
        benchmarkReturns: mockBenchmarkReturns
      });
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证滚动窗口影响
      expect(result.timeSeries.attribution.length)
        .toBe(mockBacktestResult.timeSeries.returns.length);
    });
  });
}); 