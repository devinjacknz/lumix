import {
  StrategyAnalysis,
  MarketAnalysis,
  RiskAssessment,
  TransactionType,
  ChainType
} from './types';

export class ResponseParser {
  // 解析策略分析响应
  public static parseStrategyAnalysis(content: string): StrategyAnalysis {
    try {
      // 首先尝试解析JSON
      if (this.isJsonString(content)) {
        return JSON.parse(content);
      }

      // 使用正则表达式提取结构化数据
      const analysis: StrategyAnalysis = {
        recommendation: this.extractRecommendation(content),
        confidence: this.extractConfidence(content),
        reasoning: this.extractReasoning(content),
        risks: this.extractRisks(content),
        actions: this.extractActions(content)
      };

      return analysis;
    } catch (error) {
      throw new Error(`Failed to parse strategy analysis: ${error.message}`);
    }
  }

  // 解析市场分析响应
  public static parseMarketAnalysis(content: string): MarketAnalysis {
    try {
      if (this.isJsonString(content)) {
        return JSON.parse(content);
      }

      const analysis: MarketAnalysis = {
        overview: this.extractOverview(content),
        trends: this.extractTrends(content),
        opportunities: this.extractOpportunities(content),
        risks: this.extractMarketRisks(content)
      };

      return analysis;
    } catch (error) {
      throw new Error(`Failed to parse market analysis: ${error.message}`);
    }
  }

  // 解析风险评估响应
  public static parseRiskAssessment(content: string): RiskAssessment {
    try {
      if (this.isJsonString(content)) {
        return JSON.parse(content);
      }

      const assessment: RiskAssessment = {
        overallRisk: this.extractOverallRisk(content),
        factors: this.extractRiskFactors(content),
        recommendations: this.extractRiskRecommendations(content),
        limits: this.extractRiskLimits(content)
      };

      return assessment;
    } catch (error) {
      throw new Error(`Failed to parse risk assessment: ${error.message}`);
    }
  }

  // 辅助方法
  private static isJsonString(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  private static extractRecommendation(content: string): 'buy' | 'sell' | 'hold' {
    const buyMatch = content.match(/建议[：:]\s*(买入|购买|增持)/);
    const sellMatch = content.match(/建议[：:]\s*(卖出|减持|清仓)/);
    const holdMatch = content.match(/建议[：:]\s*(持有|观望|保持)/);

    if (buyMatch) return 'buy';
    if (sellMatch) return 'sell';
    if (holdMatch) return 'hold';
    
    throw new Error('Could not extract recommendation');
  }

  private static extractConfidence(content: string): number {
    const match = content.match(/置信度[：:]\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const confidence = parseFloat(match[1]);
      return confidence > 1 ? confidence / 100 : confidence;
    }
    throw new Error('Could not extract confidence');
  }

  private static extractReasoning(content: string): string {
    const match = content.match(/分析理由[：:]([\s\S]*?)(?=\d+\.|$)/);
    if (match) {
      return match[1].trim();
    }
    throw new Error('Could not extract reasoning');
  }

  private static extractRisks(content: string): Array<{
    type: string;
    level: 'low' | 'medium' | 'high';
    description: string;
  }> {
    const riskSection = content.match(/风险分析[：:]([\s\S]*?)(?=\d+\.|$)/);
    if (!riskSection) {
      throw new Error('Could not extract risks section');
    }

    const risks: Array<{
      type: string;
      level: 'low' | 'medium' | 'high';
      description: string;
    }> = [];

    const riskMatches = riskSection[1].match(/[^。]*风险[^。]*。/g);
    if (riskMatches) {
      riskMatches.forEach(risk => {
        const level = risk.includes('高') ? 'high' :
                     risk.includes('中') ? 'medium' : 'low';
        risks.push({
          type: risk.match(/(.+?)风险/)?.[1] || '未知',
          level,
          description: risk.trim()
        });
      });
    }

    return risks;
  }

  private static extractActions(content: string): Array<{
    type: TransactionType;
    chain: ChainType;
    priority: number;
    params: Record<string, any>;
    expectedReturn?: string;
    maxSlippage?: number;
  }> {
    const actionSection = content.match(/执行动作[：:]([\s\S]*?)(?=\d+\.|$)/);
    if (!actionSection) {
      throw new Error('Could not extract actions section');
    }

    const actions: Array<{
      type: TransactionType;
      chain: ChainType;
      priority: number;
      params: Record<string, any>;
      expectedReturn?: string;
      maxSlippage?: number;
    }> = [];

    const actionMatches = actionSection[1].match(/[^。]*交易[^。]*。/g);
    if (actionMatches) {
      actionMatches.forEach(action => {
        const type = this.extractTransactionType(action);
        const chain = this.extractChainType(action);
        const priority = this.extractPriority(action);
        
        actions.push({
          type,
          chain,
          priority,
          params: this.extractActionParams(action, type),
          expectedReturn: this.extractExpectedReturn(action),
          maxSlippage: this.extractMaxSlippage(action)
        });
      });
    }

    return actions;
  }

  private static extractTransactionType(action: string): TransactionType {
    if (action.includes('转账')) return TransactionType.TRANSFER;
    if (action.includes('兑换') || action.includes('交换')) return TransactionType.SWAP;
    if (action.includes('授权')) return TransactionType.APPROVE;
    if (action.includes('质押')) return TransactionType.STAKE;
    if (action.includes('解押')) return TransactionType.UNSTAKE;
    if (action.includes('领取')) return TransactionType.CLAIM;
    return TransactionType.CONTRACT_CALL;
  }

  private static extractChainType(action: string): ChainType {
    if (action.includes('Solana')) return 'solana';
    if (action.includes('Base')) return 'base';
    return 'ethereum';
  }

  private static extractPriority(action: string): number {
    const match = action.match(/优先级[：:]\s*(\d+)/);
    return match ? parseInt(match[1]) : 1;
  }

  private static extractActionParams(action: string, type: TransactionType): Record<string, any> {
    const params: Record<string, any> = {};
    
    // 提取金额
    const amountMatch = action.match(/金额[：:]\s*(\d+(?:\.\d+)?)/);
    if (amountMatch) {
      params.amount = amountMatch[1];
    }

    // 提取代币地址
    const tokenMatch = action.match(/代币[：:]\s*(\w+)/);
    if (tokenMatch) {
      params.token = tokenMatch[1];
    }

    // 根据交易类型提取特定参数
    switch (type) {
      case TransactionType.SWAP:
        const tokenInMatch = action.match(/输入代币[：:]\s*(\w+)/);
        const tokenOutMatch = action.match(/输出代币[：:]\s*(\w+)/);
        if (tokenInMatch) params.tokenIn = tokenInMatch[1];
        if (tokenOutMatch) params.tokenOut = tokenOutMatch[1];
        break;
      case TransactionType.STAKE:
      case TransactionType.UNSTAKE:
        const validatorMatch = action.match(/验证者[：:]\s*(\w+)/);
        if (validatorMatch) params.validator = validatorMatch[1];
        break;
    }

    return params;
  }

  private static extractExpectedReturn(action: string): string | undefined {
    const match = action.match(/预期收益[：:]\s*(\d+(?:\.\d+)?)/);
    return match ? match[1] : undefined;
  }

  private static extractMaxSlippage(action: string): number | undefined {
    const match = action.match(/最大滑点[：:]\s*(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : undefined;
  }

  private static extractOverview(content: string): string {
    const match = content.match(/市场概述[：:]([\s\S]*?)(?=\d+\.|$)/);
    if (match) {
      return match[1].trim();
    }
    throw new Error('Could not extract market overview');
  }

  private static extractTrends(content: string): Array<{
    asset: string;
    trend: 'bullish' | 'bearish' | 'neutral';
    strength: number;
    factors: string[];
  }> {
    const trendSection = content.match(/趋势分析[：:]([\s\S]*?)(?=\d+\.|$)/);
    if (!trendSection) {
      throw new Error('Could not extract trends section');
    }

    const trends: Array<{
      asset: string;
      trend: 'bullish' | 'bearish' | 'neutral';
      strength: number;
      factors: string[];
    }> = [];

    const trendMatches = trendSection[1].match(/[^。]*趋势[^。]*。/g);
    if (trendMatches) {
      trendMatches.forEach(trend => {
        const assetMatch = trend.match(/(\w+)[：:]/);
        const directionMatch = trend.match(/(看涨|看跌|中性)/);
        const strengthMatch = trend.match(/强度[：:]\s*(\d+(?:\.\d+)?)/);
        const factorsMatch = trend.match(/因素[：:]([\s\S]*?)(?=\d+\.|$)/);

        if (assetMatch && directionMatch) {
          trends.push({
            asset: assetMatch[1],
            trend: directionMatch[1] === '看涨' ? 'bullish' :
                   directionMatch[1] === '看跌' ? 'bearish' : 'neutral',
            strength: strengthMatch ? parseFloat(strengthMatch[1]) : 0.5,
            factors: factorsMatch ? 
              factorsMatch[1].split(/[,，]/).map(f => f.trim()) : []
          });
        }
      });
    }

    return trends;
  }

  private static extractOpportunities(content: string): Array<{
    description: string;
    confidence: number;
    timeframe: 'short' | 'medium' | 'long';
    relatedAssets: string[];
  }> {
    const opportunitySection = content.match(/市场机会[：:]([\s\S]*?)(?=\d+\.|$)/);
    if (!opportunitySection) {
      throw new Error('Could not extract opportunities section');
    }

    const opportunities: Array<{
      description: string;
      confidence: number;
      timeframe: 'short' | 'medium' | 'long';
      relatedAssets: string[];
    }> = [];

    const opportunityMatches = opportunitySection[1].match(/[^。]*机会[^。]*。/g);
    if (opportunityMatches) {
      opportunityMatches.forEach(opportunity => {
        const confidenceMatch = opportunity.match(/置信度[：:]\s*(\d+(?:\.\d+)?)/);
        const timeframeMatch = opportunity.match(/(短期|中期|长期)/);
        const assetsMatch = opportunity.match(/相关资产[：:]([\s\S]*?)(?=\d+\.|$)/);

        opportunities.push({
          description: opportunity.trim(),
          confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
          timeframe: timeframeMatch ?
            (timeframeMatch[1] === '短期' ? 'short' :
             timeframeMatch[1] === '中期' ? 'medium' : 'long') : 'medium',
          relatedAssets: assetsMatch ?
            assetsMatch[1].split(/[,，]/).map(a => a.trim()) : []
        });
      });
    }

    return opportunities;
  }

  private static extractMarketRisks(content: string): Array<{
    description: string;
    severity: 'low' | 'medium' | 'high';
    probability: number;
    mitigation?: string;
  }> {
    const riskSection = content.match(/风险因素[：:]([\s\S]*?)(?=\d+\.|$)/);
    if (!riskSection) {
      throw new Error('Could not extract market risks section');
    }

    const risks: Array<{
      description: string;
      severity: 'low' | 'medium' | 'high';
      probability: number;
      mitigation?: string;
    }> = [];

    const riskMatches = riskSection[1].match(/[^。]*风险[^。]*。/g);
    if (riskMatches) {
      riskMatches.forEach(risk => {
        const severityMatch = risk.match(/(低|中|高)风险/);
        const probabilityMatch = risk.match(/概率[：:]\s*(\d+(?:\.\d+)?)/);
        const mitigationMatch = risk.match(/缓解措施[：:]([\s\S]*?)(?=\d+\.|$)/);

        risks.push({
          description: risk.trim(),
          severity: severityMatch ?
            (severityMatch[1] === '高' ? 'high' :
             severityMatch[1] === '中' ? 'medium' : 'low') : 'medium',
          probability: probabilityMatch ? parseFloat(probabilityMatch[1]) : 0.5,
          mitigation: mitigationMatch ? mitigationMatch[1].trim() : undefined
        });
      });
    }

    return risks;
  }

  private static extractOverallRisk(content: string): 'low' | 'medium' | 'high' {
    const match = content.match(/整体风险[：:]\s*(低|中|高)/);
    if (match) {
      return match[1] === '高' ? 'high' :
             match[1] === '中' ? 'medium' : 'low';
    }
    throw new Error('Could not extract overall risk level');
  }

  private static extractRiskFactors(content: string): Array<{
    name: string;
    risk: 'low' | 'medium' | 'high';
    impact: number;
    description: string;
  }> {
    const factorsSection = content.match(/风险因素[：:]([\s\S]*?)(?=\d+\.|$)/);
    if (!factorsSection) {
      throw new Error('Could not extract risk factors section');
    }

    const factors: Array<{
      name: string;
      risk: 'low' | 'medium' | 'high';
      impact: number;
      description: string;
    }> = [];

    const factorMatches = factorsSection[1].match(/[^。]*风险[^。]*。/g);
    if (factorMatches) {
      factorMatches.forEach(factor => {
        const nameMatch = factor.match(/(.+?)风险/);
        const riskMatch = factor.match(/(低|中|高)风险/);
        const impactMatch = factor.match(/影响程度[：:]\s*(\d+(?:\.\d+)?)/);

        factors.push({
          name: nameMatch ? nameMatch[1].trim() : '未知风险',
          risk: riskMatch ?
            (riskMatch[1] === '高' ? 'high' :
             riskMatch[1] === '中' ? 'medium' : 'low') : 'medium',
          impact: impactMatch ? parseFloat(impactMatch[1]) : 0.5,
          description: factor.trim()
        });
      });
    }

    return factors;
  }

  private static extractRiskRecommendations(content: string): Array<{
    action: string;
    priority: number;
    rationale: string;
  }> {
    const recommendationsSection = content.match(/风险管理建议[：:]([\s\S]*?)(?=\d+\.|$)/);
    if (!recommendationsSection) {
      throw new Error('Could not extract risk recommendations section');
    }

    const recommendations: Array<{
      action: string;
      priority: number;
      rationale: string;
    }> = [];

    const recommendationMatches = recommendationsSection[1].match(/[^。]*建议[^。]*。/g);
    if (recommendationMatches) {
      recommendationMatches.forEach(recommendation => {
        const actionMatch = recommendation.match(/建议[：:]\s*(.+?)(?=，|。)/);
        const priorityMatch = recommendation.match(/优先级[：:]\s*(\d+)/);
        const rationaleMatch = recommendation.match(/理由[：:]\s*(.+?)(?=。)/);

        recommendations.push({
          action: actionMatch ? actionMatch[1].trim() : recommendation.trim(),
          priority: priorityMatch ? parseInt(priorityMatch[1]) : 1,
          rationale: rationaleMatch ? rationaleMatch[1].trim() : ''
        });
      });
    }

    return recommendations;
  }

  private static extractRiskLimits(content: string): {
    maxExposure: Record<string, string>;
    stopLoss: Record<string, string>;
    takeProfit: Record<string, string>;
  } {
    const limitsSection = content.match(/建议的限制[：:]([\s\S]*?)(?=\d+\.|$)/);
    if (!limitsSection) {
      throw new Error('Could not extract risk limits section');
    }

    const limits = {
      maxExposure: {} as Record<string, string>,
      stopLoss: {} as Record<string, string>,
      takeProfit: {} as Record<string, string>
    };

    // 提取最大敞口
    const exposureMatches = limitsSection[1].match(/[^。]*最大敞口[^。]*。/g);
    if (exposureMatches) {
      exposureMatches.forEach(exposure => {
        const match = exposure.match(/(\w+)[：:]\s*(\d+(?:\.\d+)?)/);
        if (match) {
          limits.maxExposure[match[1]] = match[2];
        }
      });
    }

    // 提取止损位
    const stopLossMatches = limitsSection[1].match(/[^。]*止损位[^。]*。/g);
    if (stopLossMatches) {
      stopLossMatches.forEach(stopLoss => {
        const match = stopLoss.match(/(\w+)[：:]\s*(\d+(?:\.\d+)?)/);
        if (match) {
          limits.stopLoss[match[1]] = match[2];
        }
      });
    }

    // 提取获利目标
    const takeProfitMatches = limitsSection[1].match(/[^。]*获利目标[^。]*。/g);
    if (takeProfitMatches) {
      takeProfitMatches.forEach(takeProfit => {
        const match = takeProfit.match(/(\w+)[：:]\s*(\d+(?:\.\d+)?)/);
        if (match) {
          limits.takeProfit[match[1]] = match[2];
        }
      });
    }

    return limits;
  }
} 