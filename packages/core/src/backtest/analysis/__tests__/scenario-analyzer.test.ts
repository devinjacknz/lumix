import { ScenarioAnalyzer, ScenarioType } from '../scenario-analyzer';
import { BacktestResult } from '../../types';

describe('ScenarioAnalyzer', () => {
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
      }))
    }
  };

  describe('Historical Scenario', () => {
    const analyzer = new ScenarioAnalyzer({
      scenarios: [{
        name: 'Financial Crisis 2008',
        type: ScenarioType.HISTORICAL,
        parameters: {
          startDate: '2008-09-01',
          endDate: '2009-03-31',
          market: 'US'
        }
      }]
    });

    test('should analyze historical scenario correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证历史情景分析
      expect(result.scenarios.length).toBe(1);
      const scenario = result.scenarios[0];
      
      expect(scenario.name).toBe('Financial Crisis 2008');
      expect(scenario.type).toBe(ScenarioType.HISTORICAL);
      expect(scenario.results.returns).toBeDefined();
      expect(scenario.results.drawdown).toBeDefined();
      expect(scenario.impact.portfolio).toBeDefined();
      expect(scenario.probability).toBeGreaterThan(0);
    });
  });

  describe('Hypothetical Scenario', () => {
    const analyzer = new ScenarioAnalyzer({
      scenarios: [{
        name: 'Market Crash',
        type: ScenarioType.HYPOTHETICAL,
        parameters: {
          marketDrop: 0.3,
          volatilityIncrease: 2,
          correlationChange: 0.8,
          duration: 30
        }
      }]
    });

    test('should analyze hypothetical scenario correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证假设情景分析
      expect(result.scenarios.length).toBe(1);
      const scenario = result.scenarios[0];
      
      expect(scenario.name).toBe('Market Crash');
      expect(scenario.type).toBe(ScenarioType.HYPOTHETICAL);
      expect(scenario.results.metrics.maxDrawdown).toBeGreaterThan(0);
      expect(scenario.results.metrics.volatility).toBeGreaterThan(0);
      expect(scenario.impact.risk).toBeGreaterThan(0);
    });
  });

  describe('Monte Carlo Scenario', () => {
    const analyzer = new ScenarioAnalyzer({
      scenarios: [{
        name: 'Monte Carlo Simulation',
        type: ScenarioType.MONTE_CARLO,
        parameters: {
          numSimulations: 1000,
          timeHorizon: 1,
          returnDist: 'normal',
          volDist: 'garch'
        }
      }],
      numSimulations: 1000,
      confidenceLevel: 0.95
    });

    test('should analyze Monte Carlo scenario correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证蒙特卡洛模拟
      expect(result.scenarios.length).toBe(1);
      const scenario = result.scenarios[0];
      
      expect(scenario.name).toBe('Monte Carlo Simulation');
      expect(scenario.type).toBe(ScenarioType.MONTE_CARLO);
      expect(scenario.results.returns.length).toBeGreaterThan(0);
      expect(scenario.results.metrics).toBeDefined();
      expect(scenario.probability).toBeLessThanOrEqual(1);
    });
  });

  describe('Stress Test Scenario', () => {
    const analyzer = new ScenarioAnalyzer({
      scenarios: [{
        name: 'Extreme Volatility',
        type: ScenarioType.STRESS_TEST,
        parameters: {
          volatilityShock: 3,
          liquidityDrop: 0.5,
          correlationBreak: true,
          duration: 10
        }
      }]
    });

    test('should analyze stress test scenario correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证压力测试
      expect(result.scenarios.length).toBe(1);
      const scenario = result.scenarios[0];
      
      expect(scenario.name).toBe('Extreme Volatility');
      expect(scenario.type).toBe(ScenarioType.STRESS_TEST);
      expect(scenario.results.risks.var).toBeGreaterThan(0);
      expect(scenario.results.risks.cvar).toBeGreaterThan(0);
      expect(scenario.impact.portfolio).toBeLessThan(0);
    });
  });

  describe('Sensitivity Analysis', () => {
    const analyzer = new ScenarioAnalyzer({
      scenarios: [],
      confidenceLevel: 0.95
    });

    test('should analyze parameter sensitivity correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证参数敏感性
      expect(result.sensitivity.parameters).toBeDefined();
      Object.values(result.sensitivity.parameters).forEach(param => {
        expect(param.impact).toBeDefined();
        expect(param.elasticity).toBeDefined();
        expect(param.threshold).toBeDefined();
      });
    });

    test('should analyze correlation sensitivity correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证相关性敏感性
      expect(result.sensitivity.correlations).toBeDefined();
      result.sensitivity.correlations.forEach(corr => {
        expect(corr.factor1).toBeDefined();
        expect(corr.factor2).toBeDefined();
        expect(corr.correlation).toBeGreaterThanOrEqual(-1);
        expect(corr.correlation).toBeLessThanOrEqual(1);
        expect(corr.impact).toBeDefined();
      });
    });

    test('should analyze stress sensitivity correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证压力敏感性
      expect(result.sensitivity.stress).toBeDefined();
      result.sensitivity.stress.forEach(stress => {
        expect(stress.factor).toBeDefined();
        expect(stress.threshold).toBeDefined();
        expect(stress.impact).toBeDefined();
      });
    });
  });

  describe('Distribution Analysis', () => {
    const analyzer = new ScenarioAnalyzer({
      scenarios: [],
      confidenceLevel: 0.95
    });

    test('should analyze returns distribution correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证收益分布
      expect(result.distribution.returns.mean).toBeDefined();
      expect(result.distribution.returns.std).toBeGreaterThan(0);
      expect(result.distribution.returns.skewness).toBeDefined();
      expect(result.distribution.returns.kurtosis).toBeDefined();
      expect(result.distribution.returns.percentiles).toBeDefined();
    });

    test('should analyze drawdown distribution correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证回撤分布
      expect(result.distribution.drawdown.mean).toBeLessThan(0);
      expect(result.distribution.drawdown.std).toBeGreaterThan(0);
      expect(result.distribution.drawdown.maxDrawdown).toBeLessThan(0);
      expect(result.distribution.drawdown.recoveryTime).toBeGreaterThan(0);
    });

    test('should analyze risk distribution correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证风险分布
      expect(result.distribution.risk.var).toBeGreaterThan(0);
      expect(result.distribution.risk.cvar).toBeGreaterThan(0);
      expect(result.distribution.risk.tailRisk).toBeGreaterThan(0);
    });
  });

  describe('Robustness Analysis', () => {
    const analyzer = new ScenarioAnalyzer({
      scenarios: [],
      confidenceLevel: 0.95
    });

    test('should analyze strategy robustness correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证策略稳健性
      expect(result.robustness.stability).toBeGreaterThan(0);
      expect(result.robustness.stability).toBeLessThanOrEqual(1);
      expect(result.robustness.resilience).toBeGreaterThan(0);
      expect(result.robustness.resilience).toBeLessThanOrEqual(1);
      expect(result.robustness.adaptability).toBeGreaterThan(0);
      expect(result.robustness.adaptability).toBeLessThanOrEqual(1);
    });

    test('should identify key scenarios correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证关键情景
      expect(result.robustness.scenarios).toBeDefined();
      result.robustness.scenarios.forEach(scenario => {
        expect(scenario.name).toBeDefined();
        expect(scenario.impact).toBeDefined();
        expect(scenario.probability).toBeGreaterThan(0);
        expect(scenario.probability).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid scenario type', () => {
      const analyzer = new ScenarioAnalyzer({
        scenarios: [{
          name: 'Invalid',
          type: 'invalid' as ScenarioType,
          parameters: {}
        }]
      });
      
      expect(() => analyzer.analyze(mockBacktestResult)).toThrow();
    });

    test('should handle empty returns', () => {
      const analyzer = new ScenarioAnalyzer({
        scenarios: []
      });
      
      const emptyResult = {
        ...mockBacktestResult,
        timeSeries: {
          ...mockBacktestResult.timeSeries,
          returns: []
        }
      };
      
      expect(() => analyzer.analyze(emptyResult)).toThrow();
    });

    test('should handle invalid parameters', () => {
      const analyzer = new ScenarioAnalyzer({
        scenarios: [{
          name: 'Invalid Parameters',
          type: ScenarioType.MONTE_CARLO,
          parameters: {
            numSimulations: -1
          }
        }]
      });
      
      expect(() => analyzer.analyze(mockBacktestResult)).toThrow();
    });
  });

  describe('Configuration Options', () => {
    test('should respect confidence level setting', () => {
      const analyzer1 = new ScenarioAnalyzer({
        scenarios: [],
        confidenceLevel: 0.95
      });
      
      const analyzer2 = new ScenarioAnalyzer({
        scenarios: [],
        confidenceLevel: 0.99
      });
      
      const result1 = analyzer1.analyze(mockBacktestResult);
      const result2 = analyzer2.analyze(mockBacktestResult);
      
      expect(result1.distribution.risk.var)
        .toBeLessThan(result2.distribution.risk.var);
    });

    test('should handle different simulation counts', () => {
      const analyzer1 = new ScenarioAnalyzer({
        scenarios: [{
          name: 'Monte Carlo',
          type: ScenarioType.MONTE_CARLO,
          parameters: {}
        }],
        numSimulations: 100
      });
      
      const analyzer2 = new ScenarioAnalyzer({
        scenarios: [{
          name: 'Monte Carlo',
          type: ScenarioType.MONTE_CARLO,
          parameters: {}
        }],
        numSimulations: 1000
      });
      
      const result1 = analyzer1.analyze(mockBacktestResult);
      const result2 = analyzer2.analyze(mockBacktestResult);
      
      expect(result1.scenarios[0].results.returns.length)
        .toBeLessThan(result2.scenarios[0].results.returns.length);
    });
  });
}); 