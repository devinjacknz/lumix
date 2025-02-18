import { ReportGenerator, ReportFormat } from '../report-generator';
import { BacktestResult } from '../../types';
import { AttributionAnalysis } from '../../analysis/attribution-analyzer';
import { ScenarioAnalysis } from '../../analysis/scenario-analyzer';
import { SensitivityAnalysis } from '../../analysis/sensitivity-analyzer';

describe('ReportGenerator', () => {
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

  // 模拟归因分析结果
  const mockAttributionAnalysis: AttributionAnalysis = {
    overall: {
      totalReturn: 0.25,
      activeReturn: 0.15,
      selectiveReturn: 0.1,
      factorReturn: 0.05
    },
    timeSeries: {
      returns: [],
      attribution: []
    },
    factors: {},
    sectors: {},
    styles: {},
    trading: {
      timing: 0.05,
      execution: 0.03,
      cost: 0.01,
      total: 0.07
    },
    risk: {
      systematic: 0.6,
      specific: 0.4,
      total: 1.0
    },
    performance: {
      information: 0.8,
      selection: 0.6,
      timing: 0.4,
      total: 1.8
    }
  };

  // 模拟情景分析结果
  const mockScenarioAnalysis: ScenarioAnalysis = {
    scenarios: [],
    sensitivity: {
      parameters: {},
      correlations: [],
      stress: []
    },
    distribution: {
      returns: {
        mean: 0.003,
        std: 0.02,
        skewness: 0.1,
        kurtosis: 3.0,
        percentiles: {}
      },
      drawdown: {
        mean: -0.05,
        std: 0.02,
        maxDrawdown: -0.1,
        recoveryTime: 10
      },
      risk: {
        var: 0.02,
        cvar: 0.03,
        tailRisk: 0.04
      }
    },
    robustness: {
      stability: 0.8,
      resilience: 0.7,
      adaptability: 0.6,
      scenarios: []
    }
  };

  // 模拟敏感性分析结果
  const mockSensitivityAnalysis: SensitivityAnalysis = {
    parameters: {},
    interactions: [],
    temporal: {
      stability: [],
      trends: [],
      seasonality: []
    },
    risk: {
      var: {},
      volatility: {},
      drawdown: {},
      correlation: {}
    },
    scenarios: [],
    robustness: {
      parameters: {},
      overall: 0.75
    }
  };

  describe('Report Generation', () => {
    test('should generate JSON report correctly', async () => {
      const generator = new ReportGenerator({
        format: ReportFormat.JSON,
        title: 'Test Report',
        description: 'Test Description',
        author: 'Test Author',
        date: new Date('2024-03-31')
      });

      const report = await generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      );

      const content = JSON.parse(report);

      // 验证报告结构
      expect(content.metadata).toBeDefined();
      expect(content.summary).toBeDefined();
      expect(content.configuration).toBeDefined();
      expect(content.performance).toBeDefined();
      expect(content.attribution).toBeDefined();
      expect(content.scenarios).toBeDefined();
      expect(content.sensitivity).toBeDefined();
      expect(content.charts).toBeDefined();
      expect(content.trades).toBeDefined();
      expect(content.riskAnalysis).toBeDefined();
      expect(content.recommendations).toBeDefined();

      // 验证元数据
      expect(content.metadata.title).toBe('Test Report');
      expect(content.metadata.description).toBe('Test Description');
      expect(content.metadata.author).toBe('Test Author');
      expect(new Date(content.metadata.date)).toEqual(new Date('2024-03-31'));
    });

    test('should generate Markdown report correctly', async () => {
      const generator = new ReportGenerator({
        format: ReportFormat.MARKDOWN,
        title: 'Test Report'
      });

      const report = await generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      );

      // 验证Markdown格式
      expect(report).toContain('# Test Report');
      expect(report).toContain('## Summary');
      expect(report).toContain('## Performance');
      expect(report).toContain('## Risk Analysis');
    });

    test('should generate HTML report correctly', async () => {
      const generator = new ReportGenerator({
        format: ReportFormat.HTML,
        title: 'Test Report',
        interactive: true
      });

      const report = await generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      );

      // 验证HTML格式
      expect(report).toContain('<!DOCTYPE html>');
      expect(report).toContain('<title>Test Report</title>');
      expect(report).toContain('<div class="chart">');
    });

    test('should generate PDF report correctly', async () => {
      const generator = new ReportGenerator({
        format: ReportFormat.PDF,
        title: 'Test Report'
      });

      const report = await generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      );

      // 验证PDF格式
      expect(report).toContain('%PDF-');
    });
  });

  describe('Chart Generation', () => {
    test('should generate charts when enabled', async () => {
      const generator = new ReportGenerator({
        format: ReportFormat.JSON,
        charts: true
      });

      const report = await generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      );

      const content = JSON.parse(report);

      // 验证图表数据
      expect(content.charts.equity).toBeDefined();
      expect(content.charts.drawdown).toBeDefined();
      expect(content.charts.returns).toBeDefined();
      expect(content.charts.positions).toBeDefined();
      expect(content.charts.risk).toBeDefined();
    });

    test('should skip charts when disabled', async () => {
      const generator = new ReportGenerator({
        format: ReportFormat.JSON,
        charts: false
      });

      const report = await generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      );

      const content = JSON.parse(report);

      // 验证图表数据为空
      expect(content.charts.equity).toEqual([]);
      expect(content.charts.drawdown).toEqual([]);
      expect(content.charts.returns).toEqual([]);
      expect(content.charts.positions).toEqual([]);
      expect(content.charts.risk).toEqual([]);
    });
  });

  describe('Section Selection', () => {
    test('should include only selected sections', async () => {
      const generator = new ReportGenerator({
        format: ReportFormat.JSON,
        sections: ['summary', 'performance']
      });

      const report = await generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      );

      const content = JSON.parse(report);

      // 验证只包含选定的章节
      expect(content.summary).toBeDefined();
      expect(content.performance).toBeDefined();
      expect(content.trades).toBeUndefined();
      expect(content.riskAnalysis).toBeUndefined();
    });

    test('should include all sections by default', async () => {
      const generator = new ReportGenerator({
        format: ReportFormat.JSON
      });

      const report = await generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      );

      const content = JSON.parse(report);

      // 验证包含所有章节
      expect(content.summary).toBeDefined();
      expect(content.performance).toBeDefined();
      expect(content.trades).toBeDefined();
      expect(content.riskAnalysis).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid format', () => {
      const generator = new ReportGenerator({
        format: 'invalid' as ReportFormat
      });

      expect(generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      )).rejects.toThrow();
    });

    test('should handle missing data', async () => {
      const generator = new ReportGenerator({
        format: ReportFormat.JSON
      });

      const invalidResult = {
        ...mockBacktestResult,
        timeSeries: {
          equity: [],
          drawdown: [],
          returns: []
        }
      };

      const report = await generator.generate(
        invalidResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      );

      const content = JSON.parse(report);

      // 验证处理缺失数据
      expect(content.charts.equity).toEqual([]);
      expect(content.performance.returns).toEqual({});
    });

    test('should handle invalid output path', () => {
      const generator = new ReportGenerator({
        format: ReportFormat.PDF,
        outputPath: '/invalid/path'
      });

      expect(generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      )).rejects.toThrow();
    });
  });

  describe('Internationalization', () => {
    test('should support Chinese language', async () => {
      const generator = new ReportGenerator({
        format: ReportFormat.JSON,
        language: 'zh-CN'
      });

      const report = await generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      );

      const content = JSON.parse(report);

      // 验证中文内容
      expect(content.summary.overview).toMatch(/[\\u4e00-\\u9fa5]/);
      expect(content.recommendations.strategy).toMatch(/[\\u4e00-\\u9fa5]/);
    });

    test('should support English language', async () => {
      const generator = new ReportGenerator({
        format: ReportFormat.JSON,
        language: 'en-US'
      });

      const report = await generator.generate(
        mockBacktestResult,
        mockAttributionAnalysis,
        mockScenarioAnalysis,
        mockSensitivityAnalysis
      );

      const content = JSON.parse(report);

      // 验证英文内容
      expect(content.summary.overview).toMatch(/^[A-Za-z0-9\\s\\p{P}]+$/);
      expect(content.recommendations.strategy).toMatch(/^[A-Za-z0-9\\s\\p{P}]+$/);
    });
  });
}); 