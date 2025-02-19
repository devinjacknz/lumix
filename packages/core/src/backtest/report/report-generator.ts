import { logger } from '../../monitoring';
import { BacktestResult } from '../types';
import { AttributionAnalysis } from '../analysis/attribution-analyzer';
import { ScenarioAnalysis } from '../analysis/scenario-analyzer';
import { SensitivityAnalysis } from '../analysis/sensitivity-analyzer';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 报告格式枚举
 */
export enum ReportFormat {
  PDF = 'pdf',
  HTML = 'html',
  MARKDOWN = 'markdown',
  JSON = 'json'
}

/**
 * 报告配置接口
 */
export interface ReportConfig {
  format: ReportFormat;           // 报告格式
  template?: string;              // 报告模板
  outputPath?: string;           // 输出路径
  title?: string;                // 报告标题
  description?: string;          // 报告描述
  author?: string;               // 作者
  date?: Date;                   // 报告日期
  sections?: string[];           // 需要包含的章节
  charts?: boolean;              // 是否包含图表
  interactive?: boolean;         // 是否交互式
  language?: string;             // 报告语言
}

/**
 * 报告内容接口
 */
export interface ReportContent {
  // 基本信息
  metadata: {
    title: string;               // 报告标题
    description: string;         // 报告描述
    author: string;             // 作者
    date: Date;                 // 报告日期
    version: string;            // 版本号
  };

  // 执行摘要
  summary: {
    overview: string;           // 概述
    highlights: string[];       // 重点
    recommendations: string[];  // 建议
  };

  // 回测配置
  configuration: {
    strategy: any;              // 策略配置
    parameters: any;            // 参数配置
    constraints: any;           // 约束条件
    environment: any;           // 环境配置
  };

  // 性能指标
  performance: {
    returns: any;               // 收益指标
    risk: any;                  // 风险指标
    ratios: any;               // 风险调整收益
    statistics: any;            // 统计指标
  };

  // 归因分析
  attribution: AttributionAnalysis;

  // 情景分析
  scenarios: ScenarioAnalysis;

  // 敏感性分析
  sensitivity: SensitivityAnalysis;

  // 图表数据
  charts: {
    equity: any[];              // 权益曲线
    drawdown: any[];           // 回撤曲线
    returns: any[];            // 收益分布
    positions: any[];          // 持仓分析
    risk: any[];              // 风险分析
  };

  // 交易记录
  trades: {
    summary: any;               // 交易统计
    details: any[];            // 交易明细
    analysis: any;             // 交易分析
  };

  // 风险分析
  riskAnalysis: {
    var: any;                   // VaR分析
    stress: any;               // 压力测试
    limits: any;               // 风险限额
    warnings: any[];           // 风险预警
  };

  // 建议
  recommendations: {
    strategy: string[];         // 策略建议
    parameters: string[];       // 参数建议
    risk: string[];            // 风险建议
    execution: string[];       // 执行建议
  };
}

/**
 * 报告生成器类
 */
export class ReportGenerator {
  private config: Required<ReportConfig>;

  constructor(config: ReportConfig) {
    this.config = {
      format: config.format,
      template: config.template || 'default',
      outputPath: config.outputPath || './reports',
      title: config.title || 'Backtest Report',
      description: config.description || '',
      author: config.author || 'System',
      date: config.date || new Date(),
      sections: config.sections || ['all'],
      charts: config.charts !== undefined ? config.charts : true,
      interactive: config.interactive !== undefined ? config.interactive : true,
      language: config.language || 'en-US'
    };
  }

  /**
   * 生成报告
   */
  public async generate(
    result: BacktestResult,
    attribution: AttributionAnalysis,
    scenarios: ScenarioAnalysis,
    sensitivity: SensitivityAnalysis
  ): Promise<string> {
    try {
      // 生成报告内容
      const content = await this.generateContent(
        result,
        attribution,
        scenarios,
        sensitivity
      );

      // 根据格式生成报告
      let report: string;
      switch (this.config.format) {
        case ReportFormat.PDF:
          report = this.generatePDF(content);
          break;
        case ReportFormat.HTML:
          report = this.generateHTML(content);
          break;
        case ReportFormat.MARKDOWN:
          report = this.generateMarkdown(content);
          break;
        case ReportFormat.JSON:
          report = this.generateJSON(content);
          break;
        default:
          throw new Error(`Unsupported report format: ${this.config.format}`);
      }

      // 保存报告
      if (this.config.outputPath) {
        const filename = `${this.config.title.toLowerCase().replace(/\s+/g, '_')}_${
          this.config.date.toISOString().split('T')[0]
        }.${this.config.format}`;
        const filepath = path.join(this.config.outputPath, filename);
        
        // 确保目录存在
        fs.mkdirSync(path.dirname(filepath), { recursive: true });
        
        // 写入文件
        fs.writeFileSync(filepath, report);
        
        logger.info('ReportGenerator', `Report saved to ${filepath}`);
      }

      return report;
    } catch (error) {
      logger.error('ReportGenerator', 'Failed to generate report', { error });
      throw error;
    }
  }

  /**
   * 生成报告内容
   */
  private async generateContent(
    result: BacktestResult,
    attribution: AttributionAnalysis,
    scenarios: ScenarioAnalysis,
    sensitivity: SensitivityAnalysis
  ): Promise<ReportContent> {
    const content: ReportContent = {
      metadata: this.generateMetadata(),
      summary: await this.generateSummary(result),
      configuration: this.generateConfiguration(result),
      performance: this.generatePerformance(result),
      attribution,
      scenarios,
      sensitivity,
      charts: await this.generateCharts(result),
      trades: this.generateTrades(result),
      riskAnalysis: this.generateRiskAnalysis(result),
      recommendations: await this.generateRecommendations(result)
    };

    return content;
  }

  /**
   * 生成元数据
   */
  private generateMetadata(): ReportContent['metadata'] {
    return {
      title: this.config.title,
      description: this.config.description,
      author: this.config.author,
      date: this.config.date,
      version: '1.0.0'
    };
  }

  /**
   * 生成执行摘要
   */
  private async generateSummary(result: BacktestResult): Promise<ReportContent['summary']> {
    return {
      overview: this.generateOverview(result),
      highlights: this.generateHighlights(result),
      recommendations: await this.generateSummaryRecommendations(result)
    };
  }

  /**
   * 生成概述
   */
  private generateOverview(result: BacktestResult): string {
    const { metrics, trades } = result;
    return `
      回测期间从 ${result.startTime.toLocaleDateString()} 到 ${result.endTime.toLocaleDateString()}，
      总收益率为 ${metrics.totalReturns}，年化收益率为 ${metrics.annualizedReturns}。
      最大回撤为 ${metrics.maxDrawdown}，夏普比率为 ${metrics.sharpeRatio}。
      共执行 ${trades.total} 笔交易，胜率为 ${trades.winRate}。
    `;
  }

  /**
   * 生成重点
   */
  private generateHighlights(result: BacktestResult): string[] {
    const highlights = [];
    const { metrics, trades, risk } = result;

    // 收益亮点
    if (parseFloat(metrics.annualizedReturns) > 0.2) {
      highlights.push(`年化收益率达到 ${metrics.annualizedReturns}，表现优异`);
    }

    // 风险亮点
    if (parseFloat(metrics.sharpeRatio) > 2) {
      highlights.push(`夏普比率为 ${metrics.sharpeRatio}，风险调整后收益表现出色`);
    }

    // 交易亮点
    if (parseFloat(trades.winRate) > 0.6) {
      highlights.push(`交易胜率达到 ${trades.winRate}，策略稳定性良好`);
    }

    // 风控亮点
    if (parseFloat(risk.valueAtRisk) < 0.02) {
      highlights.push(`日度VaR为 ${risk.valueAtRisk}，风险控制效果显著`);
    }

    return highlights;
  }

  /**
   * 生成摘要建议
   */
  private async generateSummaryRecommendations(result: BacktestResult): Promise<string[]> {
    const recommendations = [];
    const { metrics, trades, risk } = result;

    // 收益相关建议
    if (parseFloat(metrics.annualizedReturns) < 0.1) {
      recommendations.push('建议优化策略参数以提高收益率');
    }

    // 风险相关建议
    if (parseFloat(metrics.maxDrawdown) > 0.2) {
      recommendations.push('建议加强风险控制，降低最大回撤');
    }

    // 交易相关建议
    if (parseFloat(trades.winRate) < 0.5) {
      recommendations.push('建议改进入场信号，提高交易胜率');
    }

    // 成本相关建议
    if (trades.avgDuration < 86400) {
      recommendations.push('建议延长持仓周期，降低交易成本');
    }

    return recommendations;
  }

  /**
   * 生成配置信息
   */
  private generateConfiguration(result: BacktestResult): ReportContent['configuration'] {
    return {
      strategy: result.config.strategy,
      parameters: result.config.strategy.parameters,
      constraints: result.config.strategy.constraints,
      environment: {
        startTime: result.startTime,
        endTime: result.endTime,
        initialCapital: result.config.initialCapital,
        chains: result.config.chains,
        tokens: result.config.tokens
      }
    };
  }

  /**
   * 生成性能指标
   */
  private generatePerformance(result: BacktestResult): ReportContent['performance'] {
    return {
      returns: this.generateReturnsMetrics(result),
      risk: this.generateRiskMetrics(result),
      ratios: this.generateRatiosMetrics(result),
      statistics: this.generateStatisticsMetrics(result)
    };
  }

  /**
   * 生成收益指标
   */
  private generateReturnsMetrics(result: BacktestResult): any {
    const { metrics } = result;
    return {
      total: metrics.totalReturns,
      annualized: metrics.annualizedReturns,
      monthly: [], // TODO: 计算月度收益
      cumulative: [], // TODO: 计算累积收益
      volatility: metrics.volatility
    };
  }

  /**
   * 生成风险指标
   */
  private generateRiskMetrics(result: BacktestResult): any {
    const { risk } = result;
    return {
      valueAtRisk: risk.valueAtRisk,
      expectedShortfall: risk.expectedShortfall,
      tailRatio: risk.tailRatio,
      downside: risk.downside
    };
  }

  /**
   * 生成风险调整收益指标
   */
  private generateRatiosMetrics(result: BacktestResult): any {
    const { metrics } = result;
    return {
      sharpe: metrics.sharpeRatio,
      sortino: metrics.sortinoRatio,
      calmar: metrics.calmarRatio,
      information: metrics.informationRatio
    };
  }

  /**
   * 生成统计指标
   */
  private generateStatisticsMetrics(result: BacktestResult): any {
    const { trades } = result;
    return {
      totalTrades: trades.total,
      winningTrades: trades.winning,
      losingTrades: trades.losing,
      winRate: trades.winRate,
      avgWin: trades.avgWin,
      avgLoss: trades.avgLoss,
      profitFactor: trades.profitFactor
    };
  }

  /**
   * 生成图表数据
   */
  private async generateCharts(result: BacktestResult): Promise<ReportContent['charts']> {
    if (!this.config.charts) {
      return {
        equity: [],
        drawdown: [],
        returns: [],
        positions: [],
        risk: []
      };
    }

    return {
      equity: await this.generateEquityChart(result),
      drawdown: await this.generateDrawdownChart(result),
      returns: await this.generateReturnsChart(result),
      positions: await this.generatePositionsChart(result),
      risk: await this.generateRiskChart(result)
    };
  }

  /**
   * 生成权益曲线图表
   */
  private async generateEquityChart(result: BacktestResult): Promise<any[]> {
    return result.timeSeries.equity.map(point => ({
      timestamp: point.timestamp,
      value: point.value
    }));
  }

  /**
   * 生成回撤曲线图表
   */
  private async generateDrawdownChart(result: BacktestResult): Promise<any[]> {
    return result.timeSeries.drawdown.map(point => ({
      timestamp: point.timestamp,
      value: point.value
    }));
  }

  /**
   * 生成收益分布图表
   */
  private async generateReturnsChart(result: BacktestResult): Promise<any[]> {
    return result.timeSeries.returns.map(point => ({
      timestamp: point.timestamp,
      value: point.value
    }));
  }

  /**
   * 生成持仓分析图表
   */
  private async generatePositionsChart(result: BacktestResult): Promise<any[]> {
    // TODO: 实现持仓分析图表
    return [];
  }

  /**
   * 生成风险分析图表
   */
  private async generateRiskChart(result: BacktestResult): Promise<any[]> {
    // TODO: 实现风险分析图表
    return [];
  }

  /**
   * 生成交易记录
   */
  private generateTrades(result: BacktestResult): ReportContent['trades'] {
    return {
      summary: this.generateTradesSummary(result),
      details: this.generateTradesDetails(result),
      analysis: this.generateTradesAnalysis(result)
    };
  }

  /**
   * 生成交易统计
   */
  private generateTradesSummary(result: BacktestResult): any {
    const { trades } = result;
    return {
      total: trades.total,
      winning: trades.winning,
      losing: trades.losing,
      winRate: trades.winRate,
      avgWin: trades.avgWin,
      avgLoss: trades.avgLoss,
      profitFactor: trades.profitFactor,
      avgDuration: trades.avgDuration
    };
  }

  /**
   * 生成交易明细
   */
  private generateTradesDetails(result: BacktestResult): any[] {
    // TODO: 实现交易明细生成
    return [];
  }

  /**
   * 生成交易分析
   */
  private generateTradesAnalysis(result: BacktestResult): any {
    // TODO: 实现交易分析
    return {};
  }

  /**
   * 生成风险分析
   */
  private generateRiskAnalysis(result: BacktestResult): ReportContent['riskAnalysis'] {
    return {
      var: this.generateVaRAnalysis(result),
      stress: this.generateStressAnalysis(result),
      limits: this.generateRiskLimits(result),
      warnings: this.generateRiskWarnings(result)
    };
  }

  /**
   * 生成VaR分析
   */
  private generateVaRAnalysis(result: BacktestResult): any {
    const { risk } = result;
    return {
      daily: risk.valueAtRisk,
      weekly: parseFloat(risk.valueAtRisk) * Math.sqrt(5),
      monthly: parseFloat(risk.valueAtRisk) * Math.sqrt(21),
      historical: risk.expectedShortfall
    };
  }

  /**
   * 生成压力测试分析
   */
  private generateStressAnalysis(result: BacktestResult): any {
    // TODO: 实现压力测试分析
    return {};
  }

  /**
   * 生成风险限额
   */
  private generateRiskLimits(result: BacktestResult): any {
    // TODO: 实现风险限额生成
    return {};
  }

  /**
   * 生成风险预警
   */
  private generateRiskWarnings(result: BacktestResult): any[] {
    const warnings = [];
    const { metrics, risk } = result;

    // 回撤预警
    if (parseFloat(metrics.maxDrawdown) > 0.2) {
      warnings.push({
        type: 'drawdown',
        level: 'high',
        message: `最大回撤 ${metrics.maxDrawdown} 超过警戒线 20%`
      });
    }

    // VaR预警
    if (parseFloat(risk.valueAtRisk) > 0.03) {
      warnings.push({
        type: 'var',
        level: 'medium',
        message: `日度VaR ${risk.valueAtRisk} 超过警戒线 3%`
      });
    }

    return warnings;
  }

  /**
   * 生成建议
   */
  private async generateRecommendations(result: BacktestResult): Promise<ReportContent['recommendations']> {
    return {
      strategy: await this.generateStrategyRecommendations(result),
      parameters: await this.generateParameterRecommendations(result),
      risk: await this.generateRiskRecommendations(result),
      execution: await this.generateExecutionRecommendations(result)
    };
  }

  /**
   * 生成策略建议
   */
  private async generateStrategyRecommendations(result: BacktestResult): Promise<string[]> {
    const recommendations = [];
    const { metrics, trades } = result;

    // 收益相关建议
    if (parseFloat(metrics.annualizedReturns) < 0.1) {
      recommendations.push('考虑增加策略的进场信号多样性');
      recommendations.push('优化止盈止损设置以提高收益率');
    }

    // 交易相关建议
    if (parseFloat(trades.winRate) < 0.5) {
      recommendations.push('建议增加信号过滤条件');
      recommendations.push('考虑加入趋势确认指标');
    }

    return recommendations;
  }

  /**
   * 生成参数建议
   */
  private async generateParameterRecommendations(result: BacktestResult): Promise<string[]> {
    // TODO: 实现参数建议生成
    return [];
  }

  /**
   * 生成风险建议
   */
  private async generateRiskRecommendations(result: BacktestResult): Promise<string[]> {
    const recommendations = [];
    const { metrics, risk } = result;

    // 回撤相关建议
    if (parseFloat(metrics.maxDrawdown) > 0.2) {
      recommendations.push('建议设置更严格的止损条件');
      recommendations.push('考虑增加仓位管理策略');
    }

    // 风险相关建议
    if (parseFloat(risk.valueAtRisk) > 0.03) {
      recommendations.push('建议降低单次交易的风险敞口');
      recommendations.push('考虑增加对冲策略');
    }

    return recommendations;
  }

  /**
   * 生成执行建议
   */
  private async generateExecutionRecommendations(result: BacktestResult): Promise<string[]> {
    const recommendations = [];
    const { trades } = result;

    // 交易成本相关建议
    if (trades.avgDuration < 86400) {
      recommendations.push('建议降低交易频率以减少成本');
      recommendations.push('考虑使用更优的订单执行策略');
    }

    // 滑点相关建议
    if (parseFloat(trades.avgMAE) > 0.01) {
      recommendations.push('建议优化订单执行时机');
      recommendations.push('考虑使用限价单替代市价单');
    }

    return recommendations;
  }

  /**
   * 生成PDF报告
   */
  private generatePDF(content: ReportContent): string {
    // TODO: 实现PDF报告生成
    return '';
  }

  /**
   * 生成HTML报告
   */
  private generateHTML(content: ReportContent): string {
    // TODO: 实现HTML报告生成
    return '';
  }

  /**
   * 生成Markdown报告
   */
  private generateMarkdown(content: ReportContent): string {
    let markdown = '';

    // 添加标题
    markdown += `# ${content.metadata.title}\n\n`;
    markdown += `${content.metadata.description}\n\n`;
    markdown += `作者: ${content.metadata.author}\n`;
    markdown += `日期: ${content.metadata.date.toLocaleDateString()}\n\n`;

    // 添加摘要
    markdown += `## 执行摘要\n\n`;
    markdown += `${content.summary.overview}\n\n`;
    markdown += `### 重点\n\n`;
    content.summary.highlights.forEach(highlight => {
      markdown += `- ${highlight}\n`;
    });
    markdown += '\n';

    // 添加性能指标
    markdown += `## 性能指标\n\n`;
    markdown += `### 收益指标\n\n`;
    markdown += `- 总收益率: ${content.performance.returns.total}\n`;
    markdown += `- 年化收益率: ${content.performance.returns.annualized}\n`;
    markdown += `- 波动率: ${content.performance.returns.volatility}\n\n`;

    markdown += `### 风险指标\n\n`;
    markdown += `- VaR: ${content.performance.risk.valueAtRisk}\n`;
    markdown += `- 期望短缺: ${content.performance.risk.expectedShortfall}\n`;
    markdown += `- 尾部比率: ${content.performance.risk.tailRatio}\n\n`;

    // 添加建议
    markdown += `## 建议\n\n`;
    markdown += `### 策略建议\n\n`;
    content.recommendations.strategy.forEach(rec => {
      markdown += `- ${rec}\n`;
    });
    markdown += '\n';

    markdown += `### 风险建议\n\n`;
    content.recommendations.risk.forEach(rec => {
      markdown += `- ${rec}\n`;
    });
    markdown += '\n';

    return markdown;
  }

  /**
   * 生成JSON报告
   */
  private generateJSON(content: ReportContent): string {
    return JSON.stringify(content, null, 2);
  }
} 