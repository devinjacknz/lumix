import { ReportContent } from '../report-generator';

/**
 * HTML模板配置接口
 */
export interface HTMLTemplateConfig {
  theme: 'light' | 'dark';
  interactive: boolean;
  chartLibrary: 'echarts' | 'highcharts' | 'plotly';
  customCSS?: string;
  customScripts?: string[];
}

/**
 * HTML报告模板生成器
 */
export class HTMLTemplate {
  private config: HTMLTemplateConfig;

  constructor(config: Partial<HTMLTemplateConfig> = {}) {
    this.config = {
      theme: config.theme || 'light',
      interactive: config.interactive !== undefined ? config.interactive : true,
      chartLibrary: config.chartLibrary || 'echarts',
      customCSS: config.customCSS,
      customScripts: config.customScripts || []
    };
  }

  /**
   * 生成HTML报告
   */
  public generate(content: ReportContent): string {
    return `
      <!DOCTYPE html>
      <html lang="${content.metadata.language || 'zh-CN'}">
        ${this.generateHead(content)}
        ${this.generateBody(content)}
      </html>
    `;
  }

  /**
   * 生成头部
   */
  private generateHead(content: ReportContent): string {
    return `
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${content.metadata.title}</title>
        ${this.generateStyles()}
        ${this.generateScripts()}
      </head>
    `;
  }

  /**
   * 生成样式
   */
  private generateStyles(): string {
    const themeStyles = this.config.theme === 'dark' ? this.darkThemeStyles() : this.lightThemeStyles();
    
    return `
      <style>
        ${this.baseStyles()}
        ${themeStyles}
        ${this.chartStyles()}
        ${this.config.customCSS || ''}
      </style>
    `;
  }

  /**
   * 生成脚本
   */
  private generateScripts(): string {
    const scripts = [];

    // 添加图表库
    switch (this.config.chartLibrary) {
      case 'echarts':
        scripts.push('<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>');
        break;
      case 'highcharts':
        scripts.push('<script src="https://code.highcharts.com/highcharts.js"></script>');
        break;
      case 'plotly':
        scripts.push('<script src="https://cdn.plot.ly/plotly-latest.min.js"></script>');
        break;
    }

    // 添加自定义脚本
    if (this.config.customScripts) {
      scripts.push(...this.config.customScripts.map(script => 
        `<script src="${script}"></script>`
      ));
    }

    // 添加交互脚本
    if (this.config.interactive) {
      scripts.push('<script>', this.interactiveScripts(), '</script>');
    }

    return scripts.join('\n');
  }

  /**
   * 生成主体
   */
  private generateBody(content: ReportContent): string {
    return `
      <body class="theme-${this.config.theme}">
        ${this.generateHeader(content)}
        ${this.generateNav()}
        <main class="content">
          ${this.generateSummarySection(content)}
          ${this.generatePerformanceSection(content)}
          ${this.generateRiskSection(content)}
          ${this.generateTradesSection(content)}
          ${this.generateAnalysisSection(content)}
          ${this.generateRecommendationsSection(content)}
        </main>
        ${this.generateFooter(content)}
      </body>
    `;
  }

  /**
   * 生成页眉
   */
  private generateHeader(content: ReportContent): string {
    return `
      <header class="report-header">
        <h1>${content.metadata.title}</h1>
        <div class="metadata">
          <p>作者: ${content.metadata.author}</p>
          <p>日期: ${content.metadata.date.toLocaleDateString()}</p>
          <p>版本: ${content.metadata.version}</p>
        </div>
      </header>
    `;
  }

  /**
   * 生成导航
   */
  private generateNav(): string {
    return `
      <nav class="report-nav">
        <ul>
          <li><a href="#summary">执行摘要</a></li>
          <li><a href="#performance">性能分析</a></li>
          <li><a href="#risk">风险分析</a></li>
          <li><a href="#trades">交易分析</a></li>
          <li><a href="#analysis">归因分析</a></li>
          <li><a href="#recommendations">建议</a></li>
        </ul>
      </nav>
    `;
  }

  /**
   * 生成摘要部分
   */
  private generateSummarySection(content: ReportContent): string {
    return `
      <section id="summary" class="report-section">
        <h2>执行摘要</h2>
        <div class="overview">
          <p>${content.summary.overview}</p>
        </div>
        <div class="highlights">
          <h3>重点</h3>
          <ul>
            ${content.summary.highlights.map(highlight => 
              `<li>${highlight}</li>`
            ).join('')}
          </ul>
        </div>
      </section>
    `;
  }

  /**
   * 生成性能部分
   */
  private generatePerformanceSection(content: ReportContent): string {
    return `
      <section id="performance" class="report-section">
        <h2>性能分析</h2>
        <div class="metrics-grid">
          ${this.generateMetricsCards(content.performance)}
        </div>
        <div class="charts-container">
          ${this.generateEquityChart(content.charts.equity)}
          ${this.generateReturnsChart(content.charts.returns)}
        </div>
      </section>
    `;
  }

  /**
   * 生成风险部分
   */
  private generateRiskSection(content: ReportContent): string {
    return `
      <section id="risk" class="report-section">
        <h2>风险分析</h2>
        <div class="risk-metrics">
          ${this.generateRiskMetrics(content.riskAnalysis)}
        </div>
        <div class="charts-container">
          ${this.generateDrawdownChart(content.charts.drawdown)}
          ${this.generateRiskChart(content.charts.risk)}
        </div>
        <div class="risk-warnings">
          ${this.generateWarnings(content.riskAnalysis.warnings)}
        </div>
      </section>
    `;
  }

  /**
   * 生成交易部分
   */
  private generateTradesSection(content: ReportContent): string {
    return `
      <section id="trades" class="report-section">
        <h2>交易分析</h2>
        <div class="trade-summary">
          ${this.generateTradeSummary(content.trades.summary)}
        </div>
        <div class="trade-details">
          ${this.generateTradeDetails(content.trades.details)}
        </div>
      </section>
    `;
  }

  /**
   * 生成分析部分
   */
  private generateAnalysisSection(content: ReportContent): string {
    return `
      <section id="analysis" class="report-section">
        <h2>归因分析</h2>
        <div class="attribution">
          ${this.generateAttributionAnalysis(content.attribution)}
        </div>
        <div class="scenarios">
          ${this.generateScenarioAnalysis(content.scenarios)}
        </div>
        <div class="sensitivity">
          ${this.generateSensitivityAnalysis(content.sensitivity)}
        </div>
      </section>
    `;
  }

  /**
   * 生成建议部分
   */
  private generateRecommendationsSection(content: ReportContent): string {
    return `
      <section id="recommendations" class="report-section">
        <h2>建议</h2>
        <div class="recommendations-grid">
          ${this.generateRecommendationsGrid(content.recommendations)}
        </div>
      </section>
    `;
  }

  /**
   * 生成页脚
   */
  private generateFooter(content: ReportContent): string {
    return `
      <footer class="report-footer">
        <p>生成时间: ${new Date().toLocaleString()}</p>
        <p>Powered by Lumix</p>
      </footer>
    `;
  }

  /**
   * 基础样式
   */
  private baseStyles(): string {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        line-height: 1.6;
        padding: 2rem;
      }

      .report-header {
        text-align: center;
        margin-bottom: 2rem;
      }

      .report-nav {
        position: sticky;
        top: 0;
        background: var(--bg-color);
        padding: 1rem 0;
        margin-bottom: 2rem;
        border-bottom: 1px solid var(--border-color);
      }

      .report-nav ul {
        display: flex;
        justify-content: center;
        list-style: none;
        gap: 2rem;
      }

      .report-section {
        margin-bottom: 3rem;
        padding: 2rem;
        border-radius: 8px;
        background: var(--section-bg);
        box-shadow: var(--shadow);
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
      }

      .charts-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 2rem;
        margin-bottom: 2rem;
      }

      .chart {
        min-height: 300px;
        background: var(--chart-bg);
        border-radius: 4px;
        padding: 1rem;
      }
    `;
  }

  /**
   * 亮色主题样式
   */
  private lightThemeStyles(): string {
    return `
      :root {
        --bg-color: #ffffff;
        --text-color: #333333;
        --border-color: #e0e0e0;
        --section-bg: #ffffff;
        --chart-bg: #f8f9fa;
        --shadow: 0 2px 4px rgba(0,0,0,0.1);
        --primary-color: #007bff;
        --success-color: #28a745;
        --warning-color: #ffc107;
        --danger-color: #dc3545;
      }
    `;
  }

  /**
   * 暗色主题样式
   */
  private darkThemeStyles(): string {
    return `
      :root {
        --bg-color: #1a1a1a;
        --text-color: #e0e0e0;
        --border-color: #333333;
        --section-bg: #2d2d2d;
        --chart-bg: #1a1a1a;
        --shadow: 0 2px 4px rgba(0,0,0,0.3);
        --primary-color: #0d6efd;
        --success-color: #198754;
        --warning-color: #ffc107;
        --danger-color: #dc3545;
      }

      body {
        background: var(--bg-color);
        color: var(--text-color);
      }
    `;
  }

  /**
   * 图表样式
   */
  private chartStyles(): string {
    return `
      .chart-container {
        position: relative;
        width: 100%;
        height: 400px;
      }

      .chart-title {
        font-size: 1.1rem;
        margin-bottom: 1rem;
        color: var(--text-color);
      }

      .chart-legend {
        display: flex;
        justify-content: center;
        gap: 1rem;
        margin-top: 1rem;
      }
    `;
  }

  /**
   * 交互脚本
   */
  private interactiveScripts(): string {
    return `
      document.addEventListener('DOMContentLoaded', function() {
        // 初始化图表
        initializeCharts();
        
        // 添加导航事件监听
        setupNavigation();
        
        // 添加交互功能
        setupInteractions();
      });

      function initializeCharts() {
        // 根据选择的图表库初始化图表
        switch('${this.config.chartLibrary}') {
          case 'echarts':
            initializeECharts();
            break;
          case 'highcharts':
            initializeHighcharts();
            break;
          case 'plotly':
            initializePlotly();
            break;
        }
      }

      function setupNavigation() {
        // 实现平滑滚动
        document.querySelectorAll('nav a').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            target.scrollIntoView({ behavior: 'smooth' });
          });
        });
      }

      function setupInteractions() {
        // 添加图表交互
        setupChartInteractions();
        
        // 添加数据表格排序
        setupTableSorting();
        
        // 添加过滤功能
        setupFiltering();
      }
    `;
  }

  /**
   * 生成指标卡片
   */
  private generateMetricsCards(performance: ReportContent['performance']): string {
    const { returns, risk, ratios } = performance;
    
    return `
      <div class="metric-card">
        <h3>收益指标</h3>
        <div class="metric-value">${returns.total}</div>
        <div class="metric-label">总收益率</div>
      </div>
      <div class="metric-card">
        <h3>风险指标</h3>
        <div class="metric-value">${risk.valueAtRisk}</div>
        <div class="metric-label">风险价值(VaR)</div>
      </div>
      <div class="metric-card">
        <h3>风险调整收益</h3>
        <div class="metric-value">${ratios.sharpe}</div>
        <div class="metric-label">夏普比率</div>
      </div>
    `;
  }

  /**
   * 生成权益曲线图表
   */
  private generateEquityChart(data: any[]): string {
    return `
      <div class="chart">
        <h3 class="chart-title">权益曲线</h3>
        <div id="equity-chart" class="chart-container"></div>
      </div>
    `;
  }

  /**
   * 生成收益分布图表
   */
  private generateReturnsChart(data: any[]): string {
    return `
      <div class="chart">
        <h3 class="chart-title">收益分布</h3>
        <div id="returns-chart" class="chart-container"></div>
      </div>
    `;
  }

  /**
   * 生成回撤图表
   */
  private generateDrawdownChart(data: any[]): string {
    return `
      <div class="chart">
        <h3 class="chart-title">回撤分析</h3>
        <div id="drawdown-chart" class="chart-container"></div>
      </div>
    `;
  }

  /**
   * 生成风险图表
   */
  private generateRiskChart(data: any[]): string {
    return `
      <div class="chart">
        <h3 class="chart-title">风险分析</h3>
        <div id="risk-chart" class="chart-container"></div>
      </div>
    `;
  }

  /**
   * 生成风险指标
   */
  private generateRiskMetrics(riskAnalysis: ReportContent['riskAnalysis']): string {
    return `
      <div class="risk-metrics-grid">
        <div class="risk-metric">
          <h4>VaR分析</h4>
          <ul>
            <li>日度VaR: ${riskAnalysis.var.daily}</li>
            <li>周度VaR: ${riskAnalysis.var.weekly}</li>
            <li>月度VaR: ${riskAnalysis.var.monthly}</li>
          </ul>
        </div>
      </div>
    `;
  }

  /**
   * 生成预警信息
   */
  private generateWarnings(warnings: any[]): string {
    return `
      <div class="warnings">
        <h3>风险预警</h3>
        ${warnings.map(warning => `
          <div class="warning-card ${warning.level}">
            <div class="warning-type">${warning.type}</div>
            <div class="warning-message">${warning.message}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * 生成交易统计
   */
  private generateTradeSummary(summary: any): string {
    return `
      <div class="trade-summary-grid">
        <div class="summary-item">
          <div class="label">总交易次数</div>
          <div class="value">${summary.total}</div>
        </div>
        <div class="summary-item">
          <div class="label">胜率</div>
          <div class="value">${summary.winRate}</div>
        </div>
        <div class="summary-item">
          <div class="label">盈亏比</div>
          <div class="value">${summary.profitFactor}</div>
        </div>
      </div>
    `;
  }

  /**
   * 生成交易明细
   */
  private generateTradeDetails(details: any[]): string {
    return `
      <div class="trade-details-table">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>方向</th>
              <th>价格</th>
              <th>数量</th>
              <th>盈亏</th>
            </tr>
          </thead>
          <tbody>
            ${details.map(trade => `
              <tr>
                <td>${trade.timestamp}</td>
                <td>${trade.direction}</td>
                <td>${trade.price}</td>
                <td>${trade.quantity}</td>
                <td>${trade.pnl}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * 生成归因分析
   */
  private generateAttributionAnalysis(attribution: ReportContent['attribution']): string {
    return `
      <div class="attribution-analysis">
        <h3>归因分析</h3>
        <div class="attribution-grid">
          <div class="attribution-item">
            <h4>总体归因</h4>
            <ul>
              <li>总收益: ${attribution.overall.totalReturn}</li>
              <li>主动收益: ${attribution.overall.activeReturn}</li>
              <li>选股收益: ${attribution.overall.selectiveReturn}</li>
              <li>因子收益: ${attribution.overall.factorReturn}</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 生成情景分析
   */
  private generateScenarioAnalysis(scenarios: ReportContent['scenarios']): string {
    return `
      <div class="scenario-analysis">
        <h3>情景分析</h3>
        <div class="scenarios-grid">
          ${scenarios.scenarios.map(scenario => `
            <div class="scenario-card">
              <h4>${scenario.name}</h4>
              <div class="scenario-details">
                <p>影响: ${scenario.impact.portfolio}</p>
                <p>概率: ${scenario.probability}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * 生成敏感性分析
   */
  private generateSensitivityAnalysis(sensitivity: ReportContent['sensitivity']): string {
    return `
      <div class="sensitivity-analysis">
        <h3>敏感性分析</h3>
        <div class="sensitivity-grid">
          ${Object.entries(sensitivity.parameters).map(([param, analysis]) => `
            <div class="sensitivity-card">
              <h4>${param}</h4>
              <div class="sensitivity-details">
                <p>弹性: ${analysis.elasticity}</p>
                <p>显著性: ${analysis.significance}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * 生成建议网格
   */
  private generateRecommendationsGrid(recommendations: ReportContent['recommendations']): string {
    return `
      <div class="recommendations-container">
        <div class="recommendation-section">
          <h3>策略建议</h3>
          <ul>
            ${recommendations.strategy.map(rec => `
              <li>${rec}</li>
            `).join('')}
          </ul>
        </div>
        <div class="recommendation-section">
          <h3>风险建议</h3>
          <ul>
            ${recommendations.risk.map(rec => `
              <li>${rec}</li>
            `).join('')}
          </ul>
        </div>
      </div>
    `;
  }
} 