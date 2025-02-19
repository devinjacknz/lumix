import { BigNumberish, gt, toBigInt } from '../utils/bignumber';
import { Transaction } from '../types/chain';
import { logger } from '../monitoring';
import { MEVRisk } from './mev-guard';

export interface MonitoringStats {
  totalTransactions: number;
  failedTransactions: number;
  averageGasPrice: bigint;
  averageConfirmationTime: number;
  pendingTransactions: Map<string, Transaction>;
  recentAlerts: TransactionAlert[];
}

export interface TransactionAlert {
  id: string;
  type: 'gas_price' | 'mev' | 'delay' | 'error';
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
  details: {
    threshold?: string;
    actual?: string;
    message?: string;
  };
}

export interface MonitorConfig {
  gasThreshold: BigNumberish;
  confirmationTimeout: number;
  maxPendingTransactions: number;
  alertThrottleInterval: number;
}

export class TransactionMonitor {
  private stats: MonitoringStats = {
    totalTransactions: 0,
    failedTransactions: 0,
    averageGasPrice: 0n,
    averageConfirmationTime: 0,
    pendingTransactions: new Map(),
    recentAlerts: []
  };

  constructor(private config: MonitorConfig) {}

  async monitorTransaction(tx: Transaction): Promise<void> {
    this.stats.totalTransactions++;
    this.stats.pendingTransactions.set(tx.hash, tx);

    // 检查gas价格
    if (tx.gasPrice && gt(tx.gasPrice, this.config.gasThreshold)) {
      this.createAlert({
        id: `gas-${tx.hash}`,
        type: 'gas_price',
        severity: 'high',
        timestamp: Date.now(),
        details: {
          threshold: this.config.gasThreshold.toString(),
          actual: tx.gasPrice.toString(),
          message: 'Gas price exceeds threshold'
        }
      });
    }

    // 更新统计信息
    this.updateStats();
  }

  private updateStats(): void {
    // 计算平均gas价格
    const totalGasPrice = Array.from(this.stats.pendingTransactions.values())
      .map(tx => tx.gasPrice || 0n)
      .reduce((sum, price) => sum + price, 0n);

    const count = this.stats.pendingTransactions.size;
    if (count > 0) {
      this.stats.averageGasPrice = totalGasPrice / BigInt(count);
    }

    // 清理过期交易
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const [hash, tx] of this.stats.pendingTransactions) {
      const txTime = Number(tx.timestamp || 0);
      if (now - txTime > oneHour) {
        this.stats.pendingTransactions.delete(hash);
        this.stats.failedTransactions++;

        this.createAlert({
          id: `timeout-${hash}`,
          type: 'delay',
          severity: 'medium',
          timestamp: now,
          details: {
            message: 'Transaction timed out'
          }
        });
      }
    }
  }

  private createAlert(alert: TransactionAlert): void {
    // 检查是否存在相似警报
    const similarAlert = this.stats.recentAlerts.find(
      a => a.type === alert.type && 
          Date.now() - a.timestamp < this.config.alertThrottleInterval
    );

    if (!similarAlert) {
      this.stats.recentAlerts.push(alert);
      logger.warn('Transaction', `Alert: ${alert.details.message}`, alert);

      // 保持最近警报数量在合理范围内
      if (this.stats.recentAlerts.length > 100) {
        this.stats.recentAlerts.shift();
      }
    }
  }

  getStats(): MonitoringStats {
    return { ...this.stats };
  }

  handleMEVRisk(risk: MEVRisk, tx: Transaction): void {
    this.createAlert({
      id: `mev-${tx.hash}-${risk.type}`,
      type: 'mev',
      severity: risk.severity,
      timestamp: Date.now(),
      details: {
        message: risk.description,
        actual: risk.estimatedLoss.toString()
      }
    });
  }
} 