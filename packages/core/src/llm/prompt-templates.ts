import { PromptTemplate, PromptTemplateParams, MarketData, PortfolioData, TradingHistory, TradingConstraints } from './types';

export class PromptTemplateManager {
  private static instance: PromptTemplateManager;
  private templates: Map<PromptTemplate, string>;

  private constructor() {
    this.templates = new Map();
    this.initializeTemplates();
  }

  public static getInstance(): PromptTemplateManager {
    if (!PromptTemplateManager.instance) {
      PromptTemplateManager.instance = new PromptTemplateManager();
    }
    return PromptTemplateManager.instance;
  }

  private initializeTemplates(): void {
    // 策略分析模板
    this.templates.set(PromptTemplate.STRATEGY_ANALYSIS, `
作为一个专业的加密货币交易策略分析师，请基于以下信息进行分析并提供交易建议：

市场数据：
{{marketData}}

投资组合状况：
{{portfolioData}}

历史交易记录：
{{tradingHistory}}

交易约束：
{{constraints}}

附加上下文：
{{context}}

请提供以下格式的分析结果：
1. 交易建议（买入/卖出/持有）
2. 建议的置信度（0-1）
3. 详细的分析理由
4. 潜在风险分析
5. 具体的执行动作建议，包括：
   - 交易类型
   - 目标链
   - 优先级
   - 具体参数
   - 预期收益
   - 最大滑点
`);

    // 市场分析模板
    this.templates.set(PromptTemplate.MARKET_ANALYSIS, `
请作为市场分析师，对当前加密货币市场进行全面分析：

市场数据：
{{marketData}}

请提供以下分析结果：
1. 市场概述
2. 各资产趋势分析：
   - 趋势方向（看涨/看跌/中性）
   - 趋势强度（0-1）
   - 影响因素
3. 市场机会：
   - 具体描述
   - 置信度
   - 时间框架
   - 相关资产
4. 风险因素：
   - 风险描述
   - 严重程度
   - 发生概率
   - 缓解措施
`);

    // 风险评估模板
    this.templates.set(PromptTemplate.RISK_ASSESSMENT, `
请作为风险管理专家，对当前投资组合进行风险评估：

投资组合数据：
{{portfolioData}}

市场数据：
{{marketData}}

交易历史：
{{tradingHistory}}

请提供以下评估结果：
1. 整体风险等级（低/中/高）
2. 风险因素分析：
   - 因素名称
   - 风险等级
   - 影响程度
   - 详细描述
3. 风险管理建议：
   - 具体行动
   - 优先级
   - 理由
4. 建议的限制：
   - 最大敞口
   - 止损位
   - 获利目标
`);

    // 投资组合优化模板
    this.templates.set(PromptTemplate.PORTFOLIO_OPTIMIZATION, `
请作为投资组合管理专家，对当前投资组合提供优化建议：

当前投资组合：
{{portfolioData}}

市场数据：
{{marketData}}

交易约束：
{{constraints}}

请提供以下优化建议：
1. 当前投资组合评估
2. 建议的资产配置调整
3. 具体的再平衡策略
4. 风险分散建议
5. 执行计划和时间表
`);

    // 交易信号模板
    this.templates.set(PromptTemplate.TRADING_SIGNAL, `
请基于当前市场数据生成交易信号：

市场数据：
{{marketData}}

交易约束：
{{constraints}}

请提供以下信号分析：
1. 交易方向
2. 目标资产
3. 入场价格区间
4. 止损位
5. 获利目标
6. 信号强度
7. 有效期
8. 执行建议
`);

    // 错误分析模板
    this.templates.set(PromptTemplate.ERROR_ANALYSIS, `
请分析以下交易错误并提供改进建议：

错误上下文：
{{context}}

交易历史：
{{tradingHistory}}

请提供以下分析：
1. 错误原因分析
2. 影响评估
3. 改进建议
4. 预防措施
`);
  }

  public getTemplate(type: PromptTemplate): string {
    const template = this.templates.get(type);
    if (!template) {
      throw new Error(`Template not found: ${type}`);
    }
    return template;
  }

  public generatePrompt(type: PromptTemplate, params: PromptTemplateParams): string {
    let template = this.getTemplate(type);
    
    // 替换市场数据
    if (params.marketData) {
      template = template.replace('{{marketData}}', this.formatMarketData(params.marketData));
    }

    // 替换投资组合数据
    if (params.portfolioData) {
      template = template.replace('{{portfolioData}}', this.formatPortfolioData(params.portfolioData));
    }

    // 替换交易历史
    if (params.tradingHistory) {
      template = template.replace('{{tradingHistory}}', this.formatTradingHistory(params.tradingHistory));
    }

    // 替换交易约束
    if (params.constraints) {
      template = template.replace('{{constraints}}', this.formatConstraints(params.constraints));
    }

    // 替换上下文
    if (params.context) {
      template = template.replace('{{context}}', JSON.stringify(params.context, null, 2));
    }

    return template;
  }

  private formatMarketData(data: MarketData): string {
    return `时间戳: ${data.timestamp.toISOString()}
价格:
${Object.entries(data.prices)
  .map(([token, price]) => `- ${token}: ${price}`)
  .join('\n')}

交易量:
${Object.entries(data.volumes)
  .map(([token, volume]) => `- ${token}: ${volume}`)
  .join('\n')}

价格趋势:
${Object.entries(data.trends)
  .map(([token, trend]) => `- ${token}:
    1h: ${trend.change1h}
    24h: ${trend.change24h}
    7d: ${trend.change7d}`)
  .join('\n')}

${data.indicators ? `技术指标:\n${JSON.stringify(data.indicators, null, 2)}` : ''}`;
  }

  private formatPortfolioData(data: PortfolioData): string {
    return `总价值: ${data.totalValue}

资产配置:
${data.assets.map(asset => `- ${asset.chain} ${asset.token}:
    数量: ${asset.amount}
    价值: ${asset.value}
    占比: ${asset.allocation}%`).join('\n')}

收益表现:
- 日收益率: ${data.performance.daily}%
- 周收益率: ${data.performance.weekly}%
- 月收益率: ${data.performance.monthly}%`;
  }

  private formatTradingHistory(data: TradingHistory): string {
    return `交易记录:
${data.trades.map(trade => `- ${trade.timestamp.toISOString()} ${trade.type}:
    链: ${trade.chain}
    输入: ${trade.tokenIn} ${trade.amountIn}
    输出: ${trade.tokenOut} ${trade.amountOut}
    状态: ${trade.success ? '成功' : '失败'}`).join('\n')}

统计数据:
- 总交易次数: ${data.statistics.totalTrades}
- 成功率: ${data.statistics.successRate}%
- 平均收益率: ${data.statistics.averageReturn}%`;
  }

  private formatConstraints(data: TradingConstraints): string {
    return `交易约束:
- 最大交易金额: ${data.maxTransactionValue}
- 最小交易金额: ${data.minTransactionValue}
- 允许的链: ${data.allowedChains.join(', ')}
- 允许的代币: ${data.allowedTokens.join(', ')}
- 最大滑点: ${data.maxSlippage}%
- 最小流动性: ${data.minLiquidity}
- Gas限制:
${Object.entries(data.gasLimit)
  .map(([chain, limit]) => `  ${chain}: ${limit}`)
  .join('\n')}`;
  }
} 