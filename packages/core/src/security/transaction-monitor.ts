import { BigNumber } from 'ethers';
import { ChainProtocol, Transaction } from '../chain/abstract';
import { MarketAnalyzer, MarketMetrics } from '../ai/market-analyzer';
import { KnowledgeGraph } from '../ai/knowledge-graph';
import { MEVGuard, MEVRisk } from './mev-guard';

export interface MonitorConfig {
  maxSlippage: number;
  gasThreshold: number;
  volumeThreshold: BigNumber;
  blacklist: Set<string>;
  riskLevels: {
    low: number;
    medium: number;
    high: number;
  };
  alertThresholds: {
    priceDeviation: number;
    volumeSpike: number;
    failureRate: number;
  };
}

export interface TransactionAlert {
  id: string;
  type: 'slippage' | 'gas' | 'volume' | 'blacklist' | 'mev' | 'anomaly';
  severity: 'low' | 'medium' | 'high';
  transaction: Transaction;
  details: {
    expected: any;
    actual: any;
    threshold: any;
    timestamp: number;
  };
  metadata: {
    chain: ChainProtocol;
    block: number;
    marketConditions: MarketMetrics;
  };
}

export interface MonitoringStats {
  totalTransactions: number;
  alertCount: number;
  failureRate: number;
  averageGasUsage: BigNumber;
  averageSlippage: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
}

export class TransactionMonitor {
  private alerts: TransactionAlert[] = [];
  private stats: MonitoringStats;
  private recentTransactions: Map<string, Transaction> = new Map();
  private anomalyDetector: AnomalyDetector;

  constructor(
    private config: MonitorConfig,
    private marketAnalyzer: MarketAnalyzer,
    private knowledgeGraph: KnowledgeGraph,
    private mevGuard: MEVGuard
  ) {
    this.initializeStats();
    this.anomalyDetector = new AnomalyDetector(marketAnalyzer, knowledgeGraph);
  }

  private initializeStats() {
    this.stats = {
      totalTransactions: 0,
      alertCount: 0,
      failureRate: 0,
      averageGasUsage: BigNumber.from(0),
      averageSlippage: 0,
      riskDistribution: {
        low: 0,
        medium: 0,
        high: 0,
      },
    };
  }

  async monitorTransaction(
    tx: Transaction,
    chain: ChainProtocol,
    block: number
  ): Promise<TransactionAlert[]> {
    this.stats.totalTransactions++;
    this.recentTransactions.set(tx.hash, tx);

    // 获取市场数据
    const marketData = await this.marketAnalyzer.analyzeMarket(
      tx.to,
      chain,
      '1m'
    );

    // 并行执行所有检查
    const [
      slippageAlerts,
      gasAlerts,
      volumeAlerts,
      blacklistAlerts,
      mevAlerts,
      anomalyAlerts,
    ] = await Promise.all([
      this.checkSlippage(tx, marketData.metrics),
      this.checkGasUsage(tx),
      this.checkVolume(tx, marketData.metrics),
      this.checkBlacklist(tx),
      this.checkMEVRisk(tx, chain),
      this.checkAnomalies(tx, chain, marketData.metrics),
    ]);

    // 合并所有告警
    const newAlerts = [
      ...slippageAlerts,
      ...gasAlerts,
      ...volumeAlerts,
      ...blacklistAlerts,
      ...mevAlerts,
      ...anomalyAlerts,
    ];

    // 更新统计信息
    this.updateStats(newAlerts);

    // 存储告警
    this.alerts.push(...newAlerts);

    // 清理过期数据
    this.cleanupOldData();

    return newAlerts;
  }

  private async checkSlippage(
    tx: Transaction,
    marketMetrics: MarketMetrics
  ): Promise<TransactionAlert[]> {
    const alerts: TransactionAlert[] = [];

    // 计算预期价格和实际价格
    const expectedPrice = marketMetrics.price;
    const actualPrice = this.calculateActualPrice(tx);

    // 计算滑点
    const slippage = Math.abs(actualPrice - expectedPrice) / expectedPrice;

    if (slippage > this.config.maxSlippage) {
      alerts.push({
        id: `slippage-${tx.hash}`,
        type: 'slippage',
        severity: this.calculateSeverity(slippage, this.config.maxSlippage),
        transaction: tx,
        details: {
          expected: expectedPrice,
          actual: actualPrice,
          threshold: this.config.maxSlippage,
          timestamp: Date.now(),
        },
        metadata: {
          chain: ChainProtocol.EVM,
          block: 0,
          marketConditions: marketMetrics,
        },
      });
    }

    return alerts;
  }

  private async checkGasUsage(tx: Transaction): Promise<TransactionAlert[]> {
    const alerts: TransactionAlert[] = [];

    if (tx.gasPrice && tx.gasPrice.gt(this.config.gasThreshold)) {
      alerts.push({
        id: `gas-${tx.hash}`,
        type: 'gas',
        severity: this.calculateSeverity(
          tx.gasPrice.toNumber(),
          this.config.gasThreshold
        ),
        transaction: tx,
        details: {
          expected: this.config.gasThreshold,
          actual: tx.gasPrice.toNumber(),
          threshold: this.config.gasThreshold,
          timestamp: Date.now(),
        },
        metadata: {
          chain: ChainProtocol.EVM,
          block: 0,
          marketConditions: {} as MarketMetrics,
        },
      });
    }

    return alerts;
  }

  private async checkVolume(
    tx: Transaction,
    marketMetrics: MarketMetrics
  ): Promise<TransactionAlert[]> {
    const alerts: TransactionAlert[] = [];

    if (tx.value.gt(this.config.volumeThreshold)) {
      alerts.push({
        id: `volume-${tx.hash}`,
        type: 'volume',
        severity: this.calculateSeverity(
          tx.value.toNumber(),
          this.config.volumeThreshold.toNumber()
        ),
        transaction: tx,
        details: {
          expected: this.config.volumeThreshold.toString(),
          actual: tx.value.toString(),
          threshold: this.config.volumeThreshold.toString(),
          timestamp: Date.now(),
        },
        metadata: {
          chain: ChainProtocol.EVM,
          block: 0,
          marketConditions: marketMetrics,
        },
      });
    }

    return alerts;
  }

  private async checkBlacklist(tx: Transaction): Promise<TransactionAlert[]> {
    const alerts: TransactionAlert[] = [];

    if (
      this.config.blacklist.has(tx.from) ||
      this.config.blacklist.has(tx.to)
    ) {
      alerts.push({
        id: `blacklist-${tx.hash}`,
        type: 'blacklist',
        severity: 'high',
        transaction: tx,
        details: {
          expected: 'not blacklisted',
          actual: 'blacklisted',
          threshold: 'blacklist',
          timestamp: Date.now(),
        },
        metadata: {
          chain: ChainProtocol.EVM,
          block: 0,
          marketConditions: {} as MarketMetrics,
        },
      });
    }

    return alerts;
  }

  private async checkMEVRisk(
    tx: Transaction,
    chain: ChainProtocol
  ): Promise<TransactionAlert[]> {
    const alerts: TransactionAlert[] = [];

    // 使用MEV防护系统分析风险
    const mevAnalysis = await this.mevGuard.analyzeMEVRisk(chain, tx);

    if (mevAnalysis.risks.length > 0) {
      for (const risk of mevAnalysis.risks) {
        alerts.push({
          id: `mev-${tx.hash}-${risk.type}`,
          type: 'mev',
          severity: risk.severity,
          transaction: tx,
          details: {
            expected: 0,
            actual: risk.estimatedLoss.toString(),
            threshold: 'MEV risk detected',
            timestamp: Date.now(),
          },
          metadata: {
            chain,
            block: 0,
            marketConditions: {} as MarketMetrics,
          },
        });
      }
    }

    return alerts;
  }

  private async checkAnomalies(
    tx: Transaction,
    chain: ChainProtocol,
    marketMetrics: MarketMetrics
  ): Promise<TransactionAlert[]> {
    return this.anomalyDetector.detectAnomalies(tx, chain, marketMetrics);
  }

  private calculateSeverity(
    value: number,
    threshold: number
  ): 'low' | 'medium' | 'high' {
    const ratio = value / threshold;
    if (ratio <= this.config.riskLevels.low) return 'low';
    if (ratio <= this.config.riskLevels.medium) return 'medium';
    return 'high';
  }

  private calculateActualPrice(tx: Transaction): number {
    // 实现价格计算逻辑
    return 0;
  }

  private updateStats(newAlerts: TransactionAlert[]) {
    // 更新告警计数
    this.stats.alertCount += newAlerts.length;

    // 更新风险分布
    for (const alert of newAlerts) {
      this.stats.riskDistribution[alert.severity]++;
    }

    // 更新失败率
    const failedTxCount = this.alerts.filter(
      alert => alert.severity === 'high'
    ).length;
    this.stats.failureRate = failedTxCount / this.stats.totalTransactions;

    // 更新平均gas使用
    const totalGas = this.recentTransactions
      .values()
      .reduce((sum, tx) => sum.add(tx.gasPrice || 0), BigNumber.from(0));
    this.stats.averageGasUsage = totalGas.div(this.recentTransactions.size);
  }

  private cleanupOldData() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // 清理旧告警
    this.alerts = this.alerts.filter(
      alert => now - alert.details.timestamp < oneHour
    );

    // 清理旧交易
    for (const [hash, tx] of this.recentTransactions.entries()) {
      if (now - tx.timestamp > oneHour) {
        this.recentTransactions.delete(hash);
      }
    }
  }

  getAlerts(
    options: {
      type?: TransactionAlert['type'];
      severity?: TransactionAlert['severity'];
      timeRange?: [number, number];
    } = {}
  ): TransactionAlert[] {
    let filtered = this.alerts;

    if (options.type) {
      filtered = filtered.filter(alert => alert.type === options.type);
    }

    if (options.severity) {
      filtered = filtered.filter(alert => alert.severity === options.severity);
    }

    if (options.timeRange) {
      const [start, end] = options.timeRange;
      filtered = filtered.filter(
        alert =>
          alert.details.timestamp >= start && alert.details.timestamp <= end
      );
    }

    return filtered;
  }

  getStats(): MonitoringStats {
    return { ...this.stats };
  }

  getRecentTransactions(): Transaction[] {
    return Array.from(this.recentTransactions.values());
  }
}

class AnomalyDetector {
  constructor(
    private marketAnalyzer: MarketAnalyzer,
    private knowledgeGraph: KnowledgeGraph
  ) {}

  async detectAnomalies(
    tx: Transaction,
    chain: ChainProtocol,
    marketMetrics: MarketMetrics
  ): Promise<TransactionAlert[]> {
    const alerts: TransactionAlert[] = [];

    // 检测价格异常
    const priceAnomalies = await this.detectPriceAnomalies(
      tx,
      chain,
      marketMetrics
    );
    alerts.push(...priceAnomalies);

    // 检测交易模式异常
    const patternAnomalies = await this.detectPatternAnomalies(tx, chain);
    alerts.push(...patternAnomalies);

    // 检测网络异常
    const networkAnomalies = await this.detectNetworkAnomalies(tx, chain);
    alerts.push(...networkAnomalies);

    return alerts;
  }

  private async detectPriceAnomalies(
    tx: Transaction,
    chain: ChainProtocol,
    marketMetrics: MarketMetrics
  ): Promise<TransactionAlert[]> {
    const alerts: TransactionAlert[] = [];
    
    // 实现价格异常检测逻辑
    
    return alerts;
  }

  private async detectPatternAnomalies(
    tx: Transaction,
    chain: ChainProtocol
  ): Promise<TransactionAlert[]> {
    const alerts: TransactionAlert[] = [];
    
    // 实现交易模式异常检测逻辑
    
    return alerts;
  }

  private async detectNetworkAnomalies(
    tx: Transaction,
    chain: ChainProtocol
  ): Promise<TransactionAlert[]> {
    const alerts: TransactionAlert[] = [];
    
    // 实现网络异常检测逻辑
    
    return alerts;
  }
} 