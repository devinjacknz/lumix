import { PromptTemplate } from '../types';

// 策略分析模板
export const STRATEGY_ANALYSIS_TEMPLATE = `
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
`;

// 市场分析模板
export const MARKET_ANALYSIS_TEMPLATE = `
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
`;

// 风险评估模板
export const RISK_ASSESSMENT_TEMPLATE = `
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
`;

// 投资组合优化模板
export const PORTFOLIO_OPTIMIZATION_TEMPLATE = `
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
`;

// 交易信号模板
export const TRADING_SIGNAL_TEMPLATE = `
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
`;

// 错误分析模板
export const ERROR_ANALYSIS_TEMPLATE = `
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
`;

// 市场情绪分析模板
export const MARKET_SENTIMENT_TEMPLATE = `
请分析当前市场情绪状况：

市场数据：
{{marketData}}

社交媒体数据：
{{socialData}}

新闻数据：
{{newsData}}

请提供以下分析：
1. 整体市场情绪（恐慌/中性/贪婪）
2. 情绪指标分析：
   - 交易量
   - 波动性
   - 社交活跃度
   - 新闻情绪
3. 关键影响因素
4. 情绪变化趋势
5. 交易建议
`;

// 流动性分析模板
export const LIQUIDITY_ANALYSIS_TEMPLATE = `
请分析目标资产的流动性状况：

资产数据：
{{assetData}}

市场深度：
{{marketDepth}}

交易历史：
{{tradingHistory}}

请提供以下分析：
1. 流动性评级
2. 买卖盘分析：
   - 深度分布
   - 价格影响
   - 滑点估计
3. 最佳交易规模建议
4. 执行策略建议
5. 风险提示
`;

// 套利机会分析模板
export const ARBITRAGE_ANALYSIS_TEMPLATE = `
请分析当前市场的套利机会：

市场数据：
{{marketData}}

交易所数据：
{{exchangeData}}

费用数据：
{{feeData}}

请提供以下分析：
1. 套利机会列表：
   - 交易对
   - 价差
   - 预期收益
   - 执行难度
2. 风险分析：
   - 价格风险
   - 执行风险
   - 流动性风险
3. 执行建议：
   - 交易路径
   - 规模建议
   - 时间窗口
4. 监控指标
`;

// 技术分析模板
export const TECHNICAL_ANALYSIS_TEMPLATE = `
请对目标资产进行技术分析：

价格数据：
{{priceData}}

技术指标：
{{indicators}}

市场数据：
{{marketData}}

请提供以下分析：
1. 趋势分析：
   - 主趋势
   - 次级趋势
   - 关键水平
2. 技术指标分析：
   - 移动平均线
   - RSI
   - MACD
   - 成交量
3. 形态分析：
   - 价格形态
   - 支撑阻力
   - 突破点位
4. 交易建议：
   - 入场点位
   - 止损位置
   - 目标位置
5. 风险提示
`;

// 新闻影响分析模板
export const NEWS_IMPACT_ANALYSIS_TEMPLATE = `
请分析最新新闻对市场的潜在影响：

新闻数据：
{{newsData}}

市场数据：
{{marketData}}

历史影响：
{{historicalImpact}}

请提供以下分析：
1. 新闻重要性评级
2. 潜在影响分析：
   - 直接影响
   - 间接影响
   - 长期影响
3. 受影响资产：
   - 主要影响
   - 次级影响
4. 市场反应预测：
   - 短期反应
   - 中期影响
   - 长期趋势
5. 交易建议
`;

// 链上数据分析模板
export const ONCHAIN_ANALYSIS_TEMPLATE = `
请分析链上数据指标：

链上数据：
{{onchainData}}

市场数据：
{{marketData}}

历史数据：
{{historicalData}}

请提供以下分析：
1. 网络活跃度分析：
   - 活跃地址
   - 交易量
   - 手续费
2. 持仓分布分析：
   - 大户行为
   - 散户行为
   - 流动性变化
3. 智能合约活动：
   - DeFi活动
   - NFT活动
   - 新协议部署
4. 异常行为检测：
   - 大额转账
   - 异常模式
   - 风险信号
5. 趋势预测
`;

// 导出所有模板
export const TEMPLATES = {
  [PromptTemplate.STRATEGY_ANALYSIS]: STRATEGY_ANALYSIS_TEMPLATE,
  [PromptTemplate.MARKET_ANALYSIS]: MARKET_ANALYSIS_TEMPLATE,
  [PromptTemplate.RISK_ASSESSMENT]: RISK_ASSESSMENT_TEMPLATE,
  [PromptTemplate.PORTFOLIO_OPTIMIZATION]: PORTFOLIO_OPTIMIZATION_TEMPLATE,
  [PromptTemplate.TRADING_SIGNAL]: TRADING_SIGNAL_TEMPLATE,
  [PromptTemplate.ERROR_ANALYSIS]: ERROR_ANALYSIS_TEMPLATE,
  MARKET_SENTIMENT: MARKET_SENTIMENT_TEMPLATE,
  LIQUIDITY_ANALYSIS: LIQUIDITY_ANALYSIS_TEMPLATE,
  ARBITRAGE_ANALYSIS: ARBITRAGE_ANALYSIS_TEMPLATE,
  TECHNICAL_ANALYSIS: TECHNICAL_ANALYSIS_TEMPLATE,
  NEWS_IMPACT_ANALYSIS: NEWS_IMPACT_ANALYSIS_TEMPLATE,
  ONCHAIN_ANALYSIS: ONCHAIN_ANALYSIS_TEMPLATE
}; 