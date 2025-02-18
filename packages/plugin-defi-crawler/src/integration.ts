import { KnowledgeBase, Plugin, PluginManager } from '@lumix/core';
import { NebulaPlugin } from '@lumix/plugin-nebula';
import { DeFiAnalyzer } from './analyzer';
import { LiquidityAnalyzer } from './liquidity';
import { CrawlerConfig, AnalysisReport, DeFiEvent } from './types';
import { ethers } from 'ethers';

export class IntegrationManager {
  private knowledgeBase: KnowledgeBase;
  private nebulaPlugin?: NebulaPlugin;
  private defiAnalyzer: DeFiAnalyzer;
  private liquidityAnalyzer: LiquidityAnalyzer;

  constructor(
    private pluginManager: PluginManager,
    private config: CrawlerConfig
  ) {
    this.knowledgeBase = pluginManager.getKnowledgeBase();
    this.defiAnalyzer = new DeFiAnalyzer(config.provider);
    this.liquidityAnalyzer = createLiquidityAnalyzer(config, config.provider);
  }

  async initialize() {
    // 初始化 Nebula 插件
    this.nebulaPlugin = this.pluginManager.getPlugin('nebula') as NebulaPlugin;
    if (!this.nebulaPlugin) {
      throw new Error('Nebula plugin not found');
    }

    // 初始化分析器
    await this.defiAnalyzer.initialize(this.pluginManager);

    // 注册事件监听器
    this.registerEventHandlers();
  }

  private registerEventHandlers() {
    const eventEmitter = this.pluginManager.getEventEmitter();
    if (eventEmitter) {
      // 监听分析事件
      eventEmitter.on('defi:analysis', this.handleAnalysisEvent.bind(this));
      // 监听风险警报
      eventEmitter.on('defi:risk', this.handleRiskEvent.bind(this));
      // 监听流动性变化
      eventEmitter.on('defi:liquidity', this.handleLiquidityEvent.bind(this));
    }
  }

  private async handleAnalysisEvent(event: DeFiEvent) {
    try {
      // 存储事件到知识库
      await this.knowledgeBase.store(`event:${event.type}:${event.timestamp}`, {
        type: 'event',
        data: event,
        timestamp: Date.now()
      });

      // 使用 Nebula 进行智能分析
      if (this.nebulaPlugin) {
        const analysis = await this.nebulaPlugin.chat({
          messages: [{
            role: 'user',
            content: `分析 DeFi 事件: ${JSON.stringify(event)}`
          }],
          contextFilter: {
            chains: [event.chain],
            protocols: [event.protocol]
          }
        });

        // 存储分析结果
        await this.knowledgeBase.store(`analysis:${event.type}:${event.timestamp}`, {
          type: 'analysis',
          data: analysis,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Failed to handle analysis event:', error);
    }
  }

  private async handleRiskEvent(event: DeFiEvent) {
    try {
      if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
        // 触发紧急响应
        await this.triggerEmergencyResponse(event);
      }

      // 更新风险评估
      const riskAssessment = await this.defiAnalyzer.analyzeContract(event.data.contractAddress);
      
      // 存储风险评估结果
      await this.knowledgeBase.store(`risk:${event.protocol}:${event.timestamp}`, {
        type: 'risk',
        data: riskAssessment,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to handle risk event:', error);
    }
  }

  private async handleLiquidityEvent(event: DeFiEvent) {
    try {
      // 分析流动性变化
      const liquidityAnalysis = await this.liquidityAnalyzer.analyzeLiquidity(
        event.data.tokenAddress,
        event.data.chainId
      );

      // 获取市场指标
      const marketMetrics = await this.liquidityAnalyzer.analyzeMarketMetrics(
        event.data.tokenAddress,
        event.data.chainId
      );

      // 存储分析结果
      await this.knowledgeBase.store(`liquidity:${event.protocol}:${event.timestamp}`, {
        type: 'liquidity',
        data: {
          analysis: liquidityAnalysis,
          metrics: marketMetrics
        },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to handle liquidity event:', error);
    }
  }

  private async triggerEmergencyResponse(event: DeFiEvent) {
    // 实现紧急响应逻辑
    if (this.nebulaPlugin) {
      // 使用 Nebula 执行紧急操作
      await this.nebulaPlugin.execute({
        message: `处理紧急风险事件: ${JSON.stringify(event)}`,
        autoApprove: true,
        contextFilter: {
          chains: [event.chain],
          protocols: [event.protocol]
        }
      });
    }

    // 通知相关方
    await this.notifyStakeholders(event);
  }

  private async notifyStakeholders(event: DeFiEvent) {
    // 实现通知逻辑
    const notification = {
      type: 'EMERGENCY',
      severity: event.severity,
      message: `检测到严重风险事件: ${event.type}`,
      details: event.data,
      timestamp: Date.now()
    };

    // 存储通知
    await this.knowledgeBase.store(`notification:${event.timestamp}`, {
      type: 'notification',
      data: notification,
      timestamp: Date.now()
    });
  }

  // 公共 API 方法
  async generateReport(protocol: string): Promise<AnalysisReport> {
    try {
      // 获取协议数据
      const [metrics, risks] = await Promise.all([
        this.getProtocolMetrics(protocol),
        this.getProtocolRisks(protocol)
      ]);

      // 生成建议
      const recommendations = await this.generateRecommendations(protocol, metrics, risks);

      return {
        timestamp: Date.now(),
        protocol,
        chain: this.config.chains[0], // 使用配置的第一个链
        metrics,
        risks,
        recommendations,
        metadata: {
          dataQuality: this.calculateDataQuality(metrics, risks),
          coverage: this.calculateCoverage(protocol),
          lastUpdate: Date.now()
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate report: ${error.message}`);
    }
  }

  private async getProtocolMetrics(protocol: string) {
    // 实现获取协议指标的逻辑
    return {
      tvl: 0,
      volume: 0,
      fees: 0,
      users: 0
    };
  }

  private async getProtocolRisks(protocol: string) {
    // 实现获取协议风险的逻辑
    return {
      securityScore: 0,
      liquidityRisk: 0,
      centralityRisk: 0,
      volatilityRisk: 0
    };
  }

  private async generateRecommendations(
    protocol: string,
    metrics: any,
    risks: any
  ): Promise<string[]> {
    // 实现生成建议的逻辑
    return [
      '增加安全审计覆盖率',
      '优化流动性分配',
      '实施风险控制措施'
    ];
  }

  private calculateDataQuality(metrics: any, risks: any): number {
    // 实现数据质量计算的逻辑
    return Math.random() * 100;
  }

  private calculateCoverage(protocol: string): number {
    // 实现覆盖率计算的逻辑
    return Math.random() * 100;
  }
}

export function createLiquidityAnalyzer(config: Config, provider: ethers.providers.Provider) {
  return new LiquidityAnalyzer(
    provider,
    {
      defaultSource: config.priceOracle || 'pyth',
      minimumConfidence: 0.8
    }
  );
} 