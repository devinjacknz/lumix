import { SensitivityAnalyzer } from '../sensitivity-analyzer';
import { BacktestResult } from '../../types';

describe('SensitivityAnalyzer', () => {
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

  describe('Parameter Sensitivity', () => {
    const analyzer = new SensitivityAnalyzer({
      parameters: [
        {
          name: 'stopLoss',
          range: [0.02, 0.1],
          steps: 5
        },
        {
          name: 'takeProfit',
          range: [0.05, 0.2],
          steps: 5
        }
      ]
    });

    test('should analyze parameter sensitivity correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证参数敏感性
      expect(result.parameters.stopLoss).toBeDefined();
      expect(result.parameters.takeProfit).toBeDefined();

      // 验证参数分析结果
      Object.values(result.parameters).forEach(param => {
        expect(param.values.length).toBeGreaterThan(0);
        expect(param.impacts.length).toBe(param.values.length);
        expect(param.elasticity).toBeDefined();
        expect(param.significance).toBeDefined();
        expect(param.threshold).toBeDefined();
        expect(param.optimal).toBeDefined();
      });
    });

    test('should generate parameter values correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证参数值生成
      expect(result.parameters.stopLoss.values.length).toBe(5);
      expect(result.parameters.stopLoss.values[0]).toBe(0.02);
      expect(result.parameters.stopLoss.values[4]).toBe(0.1);
    });
  });

  describe('Interaction Analysis', () => {
    const analyzer = new SensitivityAnalyzer({
      parameters: [
        {
          name: 'stopLoss',
          range: [0.02, 0.1],
          steps: 5
        },
        {
          name: 'takeProfit',
          range: [0.05, 0.2],
          steps: 5
        },
        {
          name: 'leverage',
          range: [1, 3],
          steps: 5
        }
      ]
    });

    test('should analyze parameter interactions correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证交互分析
      expect(result.interactions.length).toBe(3); // C(3,2) = 3 pairs
      
      result.interactions.forEach(interaction => {
        expect(interaction.parameter1).toBeDefined();
        expect(interaction.parameter2).toBeDefined();
        expect(interaction.correlation).toBeGreaterThanOrEqual(-1);
        expect(interaction.correlation).toBeLessThanOrEqual(1);
        expect(interaction.impact).toBeDefined();
        expect(interaction.synergy).toBeDefined();
      });
    });
  });

  describe('Temporal Analysis', () => {
    const analyzer = new SensitivityAnalyzer({
      parameters: [
        {
          name: 'stopLoss',
          range: [0.02, 0.1],
          steps: 5
        }
      ],
      timeHorizon: 1,
      correlationWindow: 20
    });

    test('should analyze temporal sensitivity correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证时间敏感性
      expect(result.temporal.stability.length).toBeGreaterThan(0);
      expect(result.temporal.trends.length).toBeGreaterThan(0);
      expect(result.temporal.seasonality.length).toBeGreaterThan(0);

      // 验证稳定性分析
      result.temporal.stability.forEach(period => {
        expect(period.window[0]).toBeInstanceOf(Date);
        expect(period.window[1]).toBeInstanceOf(Date);
        expect(period.sensitivity).toBeDefined();
        expect(period.variation).toBeDefined();
      });

      // 验证趋势分析
      result.temporal.trends.forEach(trend => {
        expect(trend.parameter).toBeDefined();
        expect(trend.direction).toBeDefined();
        expect(trend.strength).toBeGreaterThanOrEqual(0);
        expect(trend.strength).toBeLessThanOrEqual(1);
      });

      // 验证季节性分析
      result.temporal.seasonality.forEach(season => {
        expect(season.parameter).toBeDefined();
        expect(season.period).toBeGreaterThan(0);
        expect(season.amplitude).toBeGreaterThan(0);
      });
    });
  });

  describe('Risk Sensitivity', () => {
    const analyzer = new SensitivityAnalyzer({
      parameters: [
        {
          name: 'stopLoss',
          range: [0.02, 0.1],
          steps: 5
        }
      ],
      confidenceLevel: 0.95
    });

    test('should analyze risk sensitivity correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证风险敏感性
      expect(result.risk.var.stopLoss).toBeDefined();
      expect(result.risk.volatility.stopLoss).toBeDefined();
      expect(result.risk.drawdown.stopLoss).toBeDefined();
      expect(result.risk.correlation.stopLoss).toBeDefined();

      // 验证风险指标
      Object.values(result.risk).forEach(metrics => {
        Object.values(metrics).forEach(value => {
          expect(value).toBeDefined();
          expect(Number.isFinite(value)).toBe(true);
        });
      });
    });
  });

  describe('Scenario Analysis', () => {
    const analyzer = new SensitivityAnalyzer({
      parameters: [
        {
          name: 'stopLoss',
          range: [0.02, 0.1],
          steps: 5
        }
      ]
    });

    test('should analyze scenario sensitivity correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证情景分析
      expect(result.scenarios.length).toBeGreaterThan(0);
      
      result.scenarios.forEach(scenario => {
        expect(scenario.name).toBeDefined();
        expect(scenario.parameters).toBeDefined();
        expect(scenario.impact).toBeDefined();
        expect(scenario.probability).toBeGreaterThan(0);
        expect(scenario.probability).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Robustness Analysis', () => {
    const analyzer = new SensitivityAnalyzer({
      parameters: [
        {
          name: 'stopLoss',
          range: [0.02, 0.1],
          steps: 5
        },
        {
          name: 'takeProfit',
          range: [0.05, 0.2],
          steps: 5
        }
      ]
    });

    test('should analyze strategy robustness correctly', () => {
      const result = analyzer.analyze(mockBacktestResult);
      
      // 验证稳健性分析
      expect(result.robustness.parameters.stopLoss).toBeDefined();
      expect(result.robustness.parameters.takeProfit).toBeDefined();
      expect(result.robustness.overall).toBeDefined();

      // 验证参数稳健性
      Object.values(result.robustness.parameters).forEach(param => {
        expect(param.range).toBeDefined();
        expect(param.range.length).toBe(2);
        expect(param.confidence).toBeGreaterThan(0);
        expect(param.confidence).toBeLessThanOrEqual(1);
      });

      // 验证整体稳健性
      expect(result.robustness.overall).toBeGreaterThan(0);
      expect(result.robustness.overall).toBeLessThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid parameter ranges', () => {
      const analyzer = new SensitivityAnalyzer({
        parameters: [
          {
            name: 'invalid',
            range: [1, 0], // 无效范围
            steps: 5
          }
        ]
      });
      
      expect(() => analyzer.analyze(mockBacktestResult)).toThrow();
    });

    test('should handle invalid step count', () => {
      const analyzer = new SensitivityAnalyzer({
        parameters: [
          {
            name: 'stopLoss',
            range: [0.02, 0.1],
            steps: 0 // 无效步数
          }
        ]
      });
      
      expect(() => analyzer.analyze(mockBacktestResult)).toThrow();
    });

    test('should handle empty returns', () => {
      const analyzer = new SensitivityAnalyzer({
        parameters: [
          {
            name: 'stopLoss',
            range: [0.02, 0.1],
            steps: 5
          }
        ]
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
  });

  describe('Configuration Options', () => {
    test('should respect confidence level setting', () => {
      const analyzer1 = new SensitivityAnalyzer({
        parameters: [
          {
            name: 'stopLoss',
            range: [0.02, 0.1],
            steps: 5
          }
        ],
        confidenceLevel: 0.95
      });
      
      const analyzer2 = new SensitivityAnalyzer({
        parameters: [
          {
            name: 'stopLoss',
            range: [0.02, 0.1],
            steps: 5
          }
        ],
        confidenceLevel: 0.99
      });
      
      const result1 = analyzer1.analyze(mockBacktestResult);
      const result2 = analyzer2.analyze(mockBacktestResult);
      
      expect(result1.risk.var.stopLoss)
        .toBeLessThan(result2.risk.var.stopLoss);
    });

    test('should handle different correlation windows', () => {
      const analyzer1 = new SensitivityAnalyzer({
        parameters: [
          {
            name: 'stopLoss',
            range: [0.02, 0.1],
            steps: 5
          }
        ],
        correlationWindow: 10
      });
      
      const analyzer2 = new SensitivityAnalyzer({
        parameters: [
          {
            name: 'stopLoss',
            range: [0.02, 0.1],
            steps: 5
          }
        ],
        correlationWindow: 20
      });
      
      const result1 = analyzer1.analyze(mockBacktestResult);
      const result2 = analyzer2.analyze(mockBacktestResult);
      
      expect(result1.temporal.stability.length)
        .toBeLessThan(result2.temporal.stability.length);
    });
  });
}); 