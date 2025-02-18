import { BigNumber } from 'ethers';
import { ChainProtocol, Transaction } from '../chain/abstract';
import { MarketAnalyzer, MarketMetrics } from '../ai/market-analyzer';
import { KnowledgeGraph } from '../ai/knowledge-graph';
import { TransactionAlert } from './transaction-monitor';
import { MEVRisk } from './mev-guard';

export interface RiskProfile {
  id: string;
  name: string;
  description: string;
  riskFactors: RiskFactor[];
  thresholds: {
    low: number;
    medium: number;
    high: number;
  };
  weights: {
    [key in RiskFactorType]: number;
  };
}

export interface RiskFactor {
  type: RiskFactorType;
  value: number;
  weight: number;
  confidence: number;
  metadata: {
    source: string;
    timestamp: number;
    details: any;
  };
}

export type RiskFactorType =
  | 'market_volatility'
  | 'liquidity_risk'
  | 'counterparty_risk'
  | 'smart_contract_risk'
  | 'operational_risk'
  | 'regulatory_risk'
  | 'network_risk'
  | 'concentration_risk'
  | 'mev_risk'
  | 'systemic_risk';

export interface RiskAssessment {
  profileId: string;
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  factors: RiskFactor[];
  recommendations: string[];
  metadata: {
    timestamp: number;
    marketConditions: MarketMetrics;
    confidence: number;
  };
}

export interface RiskMitigation {
  riskType: RiskFactorType;
  action: string;
  priority: 'low' | 'medium' | 'high';
  expectedImpact: number;
  implementation: string;
}

export class RiskAssessor {
  private profiles: Map<string, RiskProfile> = new Map();
  private assessmentHistory: Map<string, RiskAssessment[]> = new Map();
  private mitigationStrategies: Map<RiskFactorType, RiskMitigation[]> = new Map();

  constructor(
    private marketAnalyzer: MarketAnalyzer,
    private knowledgeGraph: KnowledgeGraph
  ) {
    this.initializeDefaultProfiles();
    this.initializeMitigationStrategies();
  }

  private initializeDefaultProfiles() {
    // 初始化默认风险配置文件
    const defaultProfile: RiskProfile = {
      id: 'default',
      name: 'Default Risk Profile',
      description: 'Standard risk assessment profile for general trading',
      riskFactors: [],
      thresholds: {
        low: 0.3,
        medium: 0.6,
        high: 0.8,
      },
      weights: {
        market_volatility: 0.15,
        liquidity_risk: 0.15,
        counterparty_risk: 0.12,
        smart_contract_risk: 0.12,
        operational_risk: 0.10,
        regulatory_risk: 0.08,
        network_risk: 0.08,
        concentration_risk: 0.08,
        mev_risk: 0.07,
        systemic_risk: 0.05,
      },
    };

    this.profiles.set(defaultProfile.id, defaultProfile);
  }

  private initializeMitigationStrategies() {
    // 初始化风险缓解策略
    this.mitigationStrategies.set('market_volatility', [
      {
        riskType: 'market_volatility',
        action: '增加滑点保护',
        priority: 'high',
        expectedImpact: 0.4,
        implementation: '调整交易参数中的滑点阈值',
      },
      {
        riskType: 'market_volatility',
        action: '分批执行交易',
        priority: 'medium',
        expectedImpact: 0.3,
        implementation: '将大额交易拆分为多笔小额交易',
      },
    ]);

    this.mitigationStrategies.set('liquidity_risk', [
      {
        riskType: 'liquidity_risk',
        action: '使用流动性聚合',
        priority: 'high',
        expectedImpact: 0.5,
        implementation: '集成多个流动性来源',
      },
      {
        riskType: 'liquidity_risk',
        action: '设置流动性阈值',
        priority: 'medium',
        expectedImpact: 0.3,
        implementation: '根据市场深度调整交易规模',
      },
    ]);

    // 添加更多风险缓解策略...
  }

  async assessRisk(
    tx: Transaction,
    chain: ChainProtocol,
    profileId: string = 'default',
    alerts: TransactionAlert[] = []
  ): Promise<RiskAssessment> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Risk profile not found: ${profileId}`);
    }

    // 获取市场数据
    const marketData = await this.marketAnalyzer.analyzeMarket(
      tx.to,
      chain,
      '1m'
    );

    // 并行评估所有风险因素
    const riskFactors = await Promise.all([
      this.assessMarketVolatility(tx, marketData.metrics),
      this.assessLiquidityRisk(tx, marketData.metrics),
      this.assessCounterpartyRisk(tx, chain),
      this.assessSmartContractRisk(tx, chain),
      this.assessOperationalRisk(tx, alerts),
      this.assessRegulatoryRisk(tx, chain),
      this.assessNetworkRisk(chain),
      this.assessConcentrationRisk(tx),
      this.assessMEVRisk(tx, chain),
      this.assessSystemicRisk(chain),
    ]);

    // 计算总体风险分数
    const overallScore = this.calculateOverallScore(riskFactors, profile);

    // 确定风险等级
    const riskLevel = this.determineRiskLevel(overallScore, profile.thresholds);

    // 生成建议
    const recommendations = await this.generateRecommendations(
      riskFactors,
      riskLevel
    );

    const assessment: RiskAssessment = {
      profileId,
      overallScore,
      riskLevel,
      factors: riskFactors,
      recommendations,
      metadata: {
        timestamp: Date.now(),
        marketConditions: marketData.metrics,
        confidence: this.calculateConfidence(riskFactors),
      },
    };

    // 存储评估结果
    this.storeAssessment(tx.hash, assessment);

    return assessment;
  }

  private async assessMarketVolatility(
    tx: Transaction,
    marketMetrics: MarketMetrics
  ): Promise<RiskFactor> {
    const volatility = marketMetrics.volatility;
    const historicalVolatility = await this.getHistoricalVolatility(tx.to);
    
    const value = Math.max(volatility / historicalVolatility, 1);
    
    return {
      type: 'market_volatility',
      value,
      weight: this.profiles.get('default')?.weights.market_volatility || 0,
      confidence: 0.9,
      metadata: {
        source: 'market_analyzer',
        timestamp: Date.now(),
        details: {
          currentVolatility: volatility,
          historicalVolatility,
        },
      },
    };
  }

  private async assessLiquidityRisk(
    tx: Transaction,
    marketMetrics: MarketMetrics
  ): Promise<RiskFactor> {
    const liquidity = marketMetrics.liquidity;
    const txValue = tx.value;
    
    // 计算流动性风险
    const liquidityRatio = txValue.div(BigNumber.from(liquidity)).toNumber();
    const value = Math.min(liquidityRatio, 1);

    return {
      type: 'liquidity_risk',
      value,
      weight: this.profiles.get('default')?.weights.liquidity_risk || 0,
      confidence: 0.85,
      metadata: {
        source: 'market_analyzer',
        timestamp: Date.now(),
        details: {
          marketLiquidity: liquidity,
          transactionValue: txValue.toString(),
        },
      },
    };
  }

  private async assessCounterpartyRisk(
    tx: Transaction,
    chain: ChainProtocol
  ): Promise<RiskFactor> {
    // 从知识图谱获取交易对手方信息
    const counterpartyData = await this.getCounterpartyData(tx.to);
    
    // 计算交易对手方风险分数
    const value = this.calculateCounterpartyRiskScore(counterpartyData);

    return {
      type: 'counterparty_risk',
      value,
      weight: this.profiles.get('default')?.weights.counterparty_risk || 0,
      confidence: 0.8,
      metadata: {
        source: 'knowledge_graph',
        timestamp: Date.now(),
        details: counterpartyData,
      },
    };
  }

  private async assessSmartContractRisk(
    tx: Transaction,
    chain: ChainProtocol
  ): Promise<RiskFactor> {
    // 分析智能合约风险
    const contractAnalysis = await this.analyzeSmartContract(tx.to, chain);
    
    return {
      type: 'smart_contract_risk',
      value: contractAnalysis.riskScore,
      weight: this.profiles.get('default')?.weights.smart_contract_risk || 0,
      confidence: contractAnalysis.confidence,
      metadata: {
        source: 'contract_analyzer',
        timestamp: Date.now(),
        details: contractAnalysis,
      },
    };
  }

  private async assessOperationalRisk(
    tx: Transaction,
    alerts: TransactionAlert[]
  ): Promise<RiskFactor> {
    // 评估操作风险
    const operationalMetrics = this.analyzeOperationalMetrics(tx, alerts);
    
    return {
      type: 'operational_risk',
      value: operationalMetrics.riskScore,
      weight: this.profiles.get('default')?.weights.operational_risk || 0,
      confidence: 0.85,
      metadata: {
        source: 'system_monitor',
        timestamp: Date.now(),
        details: operationalMetrics,
      },
    };
  }

  private async assessRegulatoryRisk(
    tx: Transaction,
    chain: ChainProtocol
  ): Promise<RiskFactor> {
    // 评估监管风险
    const regulatoryAnalysis = await this.analyzeRegulatoryCompliance(tx, chain);
    
    return {
      type: 'regulatory_risk',
      value: regulatoryAnalysis.riskScore,
      weight: this.profiles.get('default')?.weights.regulatory_risk || 0,
      confidence: 0.75,
      metadata: {
        source: 'compliance_analyzer',
        timestamp: Date.now(),
        details: regulatoryAnalysis,
      },
    };
  }

  private async assessNetworkRisk(chain: ChainProtocol): Promise<RiskFactor> {
    // 评估网络风险
    const networkMetrics = await this.analyzeNetworkConditions(chain);
    
    return {
      type: 'network_risk',
      value: networkMetrics.riskScore,
      weight: this.profiles.get('default')?.weights.network_risk || 0,
      confidence: 0.9,
      metadata: {
        source: 'network_monitor',
        timestamp: Date.now(),
        details: networkMetrics,
      },
    };
  }

  private async assessConcentrationRisk(tx: Transaction): Promise<RiskFactor> {
    // 评估集中度风险
    const concentrationMetrics = await this.analyzeConcentration(tx);
    
    return {
      type: 'concentration_risk',
      value: concentrationMetrics.riskScore,
      weight: this.profiles.get('default')?.weights.concentration_risk || 0,
      confidence: 0.85,
      metadata: {
        source: 'portfolio_analyzer',
        timestamp: Date.now(),
        details: concentrationMetrics,
      },
    };
  }

  private async assessMEVRisk(
    tx: Transaction,
    chain: ChainProtocol
  ): Promise<RiskFactor> {
    // 评估MEV风险
    const mevAnalysis = await this.analyzeMEVExposure(tx, chain);
    
    return {
      type: 'mev_risk',
      value: mevAnalysis.riskScore,
      weight: this.profiles.get('default')?.weights.mev_risk || 0,
      confidence: 0.8,
      metadata: {
        source: 'mev_analyzer',
        timestamp: Date.now(),
        details: mevAnalysis,
      },
    };
  }

  private async assessSystemicRisk(chain: ChainProtocol): Promise<RiskFactor> {
    // 评估系统性风险
    const systemicAnalysis = await this.analyzeSystemicRisk(chain);
    
    return {
      type: 'systemic_risk',
      value: systemicAnalysis.riskScore,
      weight: this.profiles.get('default')?.weights.systemic_risk || 0,
      confidence: 0.7,
      metadata: {
        source: 'market_analyzer',
        timestamp: Date.now(),
        details: systemicAnalysis,
      },
    };
  }

  private calculateOverallScore(
    factors: RiskFactor[],
    profile: RiskProfile
  ): number {
    return factors.reduce((score, factor) => {
      return score + factor.value * factor.weight * factor.confidence;
    }, 0);
  }

  private determineRiskLevel(
    score: number,
    thresholds: RiskProfile['thresholds']
  ): 'low' | 'medium' | 'high' {
    if (score <= thresholds.low) return 'low';
    if (score <= thresholds.medium) return 'medium';
    return 'high';
  }

  private calculateConfidence(factors: RiskFactor[]): number {
    const totalConfidence = factors.reduce((sum, factor) => {
      return sum + factor.confidence * factor.weight;
    }, 0);

    const totalWeight = factors.reduce((sum, factor) => {
      return sum + factor.weight;
    }, 0);

    return totalConfidence / totalWeight;
  }

  private async generateRecommendations(
    factors: RiskFactor[],
    riskLevel: 'low' | 'medium' | 'high'
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // 根据风险等级筛选建议
    const priorityThreshold = riskLevel === 'high' ? 'high' : 
                            riskLevel === 'medium' ? 'medium' : 'low';

    // 处理每个风险因素
    for (const factor of factors) {
      if (factor.value > 0.5) { // 风险值超过50%时生成建议
        const mitigations = this.mitigationStrategies.get(factor.type) || [];
        
        // 根据风险等级筛选缓解策略
        const relevantMitigations = mitigations.filter(m => 
          this.getPriorityValue(m.priority) >= this.getPriorityValue(priorityThreshold)
        );

        // 添加建议
        for (const mitigation of relevantMitigations) {
          recommendations.push(
            `[${factor.type}] ${mitigation.action}: ${mitigation.implementation}`
          );
        }
      }
    }

    return recommendations;
  }

  private getPriorityValue(priority: 'low' | 'medium' | 'high'): number {
    switch (priority) {
      case 'low': return 1;
      case 'medium': return 2;
      case 'high': return 3;
    }
  }

  private async getHistoricalVolatility(asset: string): Promise<number> {
    // 实现历史波动率计算
    return 0.2; // 示例值
  }

  private async getCounterpartyData(address: string): Promise<any> {
    // 实现交易对手方数据获取
    return {};
  }

  private calculateCounterpartyRiskScore(data: any): number {
    // 实现交易对手方风险评分
    return 0.5;
  }

  private async analyzeSmartContract(
    address: string,
    chain: ChainProtocol
  ): Promise<{
    riskScore: number;
    confidence: number;
  }> {
    // 实现智能合约风险分析
    return {
      riskScore: 0.3,
      confidence: 0.8,
    };
  }

  private analyzeOperationalMetrics(
    tx: Transaction,
    alerts: TransactionAlert[]
  ): {
    riskScore: number;
  } {
    // 实现操作风险分析
    return {
      riskScore: 0.2,
    };
  }

  private async analyzeRegulatoryCompliance(
    tx: Transaction,
    chain: ChainProtocol
  ): Promise<{
    riskScore: number;
  }> {
    // 实现监管合规分析
    return {
      riskScore: 0.1,
    };
  }

  private async analyzeNetworkConditions(
    chain: ChainProtocol
  ): Promise<{
    riskScore: number;
  }> {
    // 实现网络状况分析
    return {
      riskScore: 0.2,
    };
  }

  private async analyzeConcentration(
    tx: Transaction
  ): Promise<{
    riskScore: number;
  }> {
    // 实现集中度分析
    return {
      riskScore: 0.3,
    };
  }

  private async analyzeMEVExposure(
    tx: Transaction,
    chain: ChainProtocol
  ): Promise<{
    riskScore: number;
  }> {
    // 实现MEV风险分析
    return {
      riskScore: 0.4,
    };
  }

  private async analyzeSystemicRisk(
    chain: ChainProtocol
  ): Promise<{
    riskScore: number;
  }> {
    // 实现系统性风险分析
    return {
      riskScore: 0.2,
    };
  }

  private storeAssessment(txHash: string, assessment: RiskAssessment) {
    const history = this.assessmentHistory.get(txHash) || [];
    history.push(assessment);
    this.assessmentHistory.set(txHash, history);
  }

  getAssessmentHistory(txHash: string): RiskAssessment[] {
    return this.assessmentHistory.get(txHash) || [];
  }

  addProfile(profile: RiskProfile): void {
    this.profiles.set(profile.id, profile);
  }

  getProfile(profileId: string): RiskProfile | undefined {
    return this.profiles.get(profileId);
  }

  addMitigationStrategy(
    riskType: RiskFactorType,
    strategy: RiskMitigation
  ): void {
    const strategies = this.mitigationStrategies.get(riskType) || [];
    strategies.push(strategy);
    this.mitigationStrategies.set(riskType, strategies);
  }

  getMitigationStrategies(riskType: RiskFactorType): RiskMitigation[] {
    return this.mitigationStrategies.get(riskType) || [];
  }
} 