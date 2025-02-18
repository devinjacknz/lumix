import { Plugin, PluginManager } from '@lumix/core';
import { DeFiAnalyzer } from './analyzer';
import { LiquidityAnalyzer } from './liquidity';
import { IntegrationManager } from './integration';
import { CrawlerConfig, AnalysisReport, DeFiEvent } from './types';

export class DeFiCrawlerPlugin implements Plugin {
  private analyzer: DeFiAnalyzer;
  private liquidityAnalyzer: LiquidityAnalyzer;
  private integrationManager: IntegrationManager;
  private isInitialized: boolean = false;

  constructor(private config: CrawlerConfig) {
    this.analyzer = new DeFiAnalyzer(config.provider);
    this.liquidityAnalyzer = new LiquidityAnalyzer(
      config.provider,
      config.dexScreenerApi,
      config.coingeckoApi
    );
  }

  async initialize(manager: PluginManager): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // 初始化集成管理器
    this.integrationManager = new IntegrationManager(manager, this.config);
    await this.integrationManager.initialize();

    // 初始化分析器
    await this.analyzer.initialize(manager);

    // 注册事件处理器
    this.registerEventHandlers(manager);

    // 启动定时任务
    this.startScheduledTasks();

    this.isInitialized = true;
  }

  private registerEventHandlers(manager: PluginManager) {
    const eventEmitter = manager.getEventEmitter();
    if (eventEmitter) {
      // 监听合约分析请求
      eventEmitter.on('defi:analyze_contract', async (address: string) => {
        try {
          const result = await this.analyzer.analyzeContract(address);
          eventEmitter.emit('defi:analysis_complete', {
            type: 'CONTRACT_ANALYSIS',
            data: result,
            timestamp: Date.now()
          });
        } catch (error) {
          console.error(`Contract analysis failed: ${error.message}`);
        }
      });

      // 监听流动性分析请求
      eventEmitter.on('defi:analyze_liquidity', async (params: { address: string, chainId: number }) => {
        try {
          const [liquidity, metrics] = await Promise.all([
            this.liquidityAnalyzer.analyzeLiquidity(params.address, params.chainId),
            this.liquidityAnalyzer.analyzeMarketMetrics(params.address, params.chainId)
          ]);

          eventEmitter.emit('defi:liquidity_analysis_complete', {
            type: 'LIQUIDITY_ANALYSIS',
            data: { liquidity, metrics },
            timestamp: Date.now()
          });
        } catch (error) {
          console.error(`Liquidity analysis failed: ${error.message}`);
        }
      });
    }
  }

  private startScheduledTasks() {
    // 定期执行协议分析
    setInterval(async () => {
      try {
        for (const chain of this.config.chains) {
          for (const protocol of this.config.protocols) {
            await this.analyzeProtocol(chain, protocol);
          }
        }
      } catch (error) {
        console.error(`Scheduled analysis failed: ${error.message}`);
      }
    }, this.config.interval);
  }

  private async analyzeProtocol(chain: any, protocol: string) {
    try {
      // 生成分析报告
      const report = await this.integrationManager.generateReport(protocol);

      // 检查风险阈值
      this.checkRiskThresholds(report);

      // 存储报告
      const knowledgeBase = this.integrationManager['knowledgeBase'];
      if (knowledgeBase) {
        await knowledgeBase.store(`report:${protocol}:${report.timestamp}`, {
          type: 'report',
          data: report,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error(`Protocol analysis failed: ${error.message}`);
    }
  }

  private checkRiskThresholds(report: AnalysisReport) {
    const eventEmitter = this.integrationManager['pluginManager'].getEventEmitter();
    if (!eventEmitter) return;

    // 检查安全风险
    if (report.risks.securityScore < 50) {
      eventEmitter.emit('defi:risk', {
        type: 'SECURITY_ALERT',
        severity: 'HIGH',
        protocol: report.protocol,
        chain: report.chain,
        data: {
          score: report.risks.securityScore,
          issues: report.recommendations
        },
        timestamp: Date.now()
      } as DeFiEvent);
    }

    // 检查流动性风险
    if (report.risks.liquidityRisk > 70) {
      eventEmitter.emit('defi:risk', {
        type: 'LIQUIDITY_ALERT',
        severity: 'HIGH',
        protocol: report.protocol,
        chain: report.chain,
        data: {
          risk: report.risks.liquidityRisk,
          recommendations: report.recommendations
        },
        timestamp: Date.now()
      } as DeFiEvent);
    }

    // 检查中心化风险
    if (report.risks.centralityRisk > 80) {
      eventEmitter.emit('defi:risk', {
        type: 'CENTRALITY_ALERT',
        severity: 'CRITICAL',
        protocol: report.protocol,
        chain: report.chain,
        data: {
          risk: report.risks.centralityRisk,
          recommendations: report.recommendations
        },
        timestamp: Date.now()
      } as DeFiEvent);
    }
  }

  // 公共 API 方法
  async analyzeContract(address: string) {
    return this.analyzer.analyzeContract(address);
  }

  async analyzeLiquidity(address: string, chainId: number) {
    return this.liquidityAnalyzer.analyzeLiquidity(address, chainId);
  }

  async getMarketMetrics(address: string, chainId: number) {
    return this.liquidityAnalyzer.analyzeMarketMetrics(address, chainId);
  }

  async generateReport(protocol: string) {
    return this.integrationManager.generateReport(protocol);
  }
}

// 导出类型
export * from './types';
