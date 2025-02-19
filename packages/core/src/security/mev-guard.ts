import { BigNumberish, gt } from '../utils/bignumber';
import { ChainProtocol, Transaction } from '../types/chain';
import { logger } from '../monitoring';

export interface MEVRisk {
  type: 'sandwich' | 'frontrunning' | 'backrunning' | 'arbitrage';
  severity: 'low' | 'medium' | 'high';
  description: string;
  estimatedLoss: bigint;
  details: {
    actualGas?: bigint;
    maxPriorityFee?: bigint;
    maxBaseFee?: bigint;
    attackerAddress?: string;
    attackVector?: string;
  };
}

export interface MEVConfig {
  thresholds: {
    gas: BigNumberish;
    maxPriorityFee: BigNumberish;
    maxBaseFee: BigNumberish;
  };
  blacklist: Set<string>;
  protectionLevel: 'low' | 'medium' | 'high';
}

export interface MEVProtection {
  enabled: boolean;
  maxSlippage: number;
  timeoutBlocks: number;
  privateMempool: boolean;
  flashbotsEnabled: boolean;
}

export interface MEVAnalysis {
  risks: MEVRisk[];
  totalRisk: number;
  recommendations: string[];
  protectionEnabled: boolean;
}

export class MEVGuard {
  private protectionSettings: Map<ChainProtocol, MEVProtection> = new Map();

  constructor(private config: MEVConfig) {
    this.initializeDefaultSettings();
  }

  private initializeDefaultSettings() {
    // 以太坊主网默认设置
    this.protectionSettings.set(ChainProtocol.EVM, {
      enabled: true,
      maxSlippage: 0.005, // 0.5%
      timeoutBlocks: 3,
      privateMempool: true,
      flashbotsEnabled: true,
    });

    // Solana默认设置
    this.protectionSettings.set(ChainProtocol.SOLANA, {
      enabled: true,
      maxSlippage: 0.01, // 1%
      timeoutBlocks: 10,
      privateMempool: false,
      flashbotsEnabled: false,
    });
  }

  async analyzeMEVRisk(tx: Transaction): Promise<MEVRisk[]> {
    const risks: MEVRisk[] = [];

    // 检查gas价格风险
    if (tx.gasPrice && gt(tx.gasPrice, this.config.thresholds.gas)) {
      const risk: MEVRisk = {
        type: 'frontrunning',
        severity: 'high',
        description: 'High gas price indicates potential frontrunning',
        estimatedLoss: tx.value || 0n,
        details: {
          actualGas: tx.gasPrice
        }
      };
      risks.push(risk);
    }

    // 检查优先费用风险
    if (tx.maxPriorityFeePerGas && gt(tx.maxPriorityFeePerGas, this.config.thresholds.maxPriorityFee)) {
      const risk: MEVRisk = {
        type: 'frontrunning',
        severity: 'medium',
        description: 'High priority fee indicates potential MEV',
        estimatedLoss: tx.value || 0n,
        details: {
          maxPriorityFee: tx.maxPriorityFeePerGas
        }
      };
      risks.push(risk);
    }

    // 检查基础费用风险
    if (tx.maxFeePerGas && gt(tx.maxFeePerGas, this.config.thresholds.maxBaseFee)) {
      const risk: MEVRisk = {
        type: 'sandwich',
        severity: 'medium',
        description: 'High base fee indicates potential sandwich attack',
        estimatedLoss: tx.value || 0n,
        details: {
          maxBaseFee: tx.maxFeePerGas
        }
      };
      risks.push(risk);
    }

    // 记录风险分析结果
    if (risks.length > 0) {
      logger.warn('MEV', `Detected ${risks.length} MEV risks for transaction ${tx.hash}`, {
        risks: risks.map(r => ({
          type: r.type,
          severity: r.severity,
          description: r.description
        }))
      });
    }

    return risks;
  }

  private estimatePotentialLoss(tx: Transaction): bigint {
    // 基于交易值和gas费用估算潜在损失
    const gasCost = tx.gasPrice ? tx.gasPrice * (tx.gasLimit || 21000n) : 0n;
    return (tx.value || 0n) + gasCost;
  }

  async protectTransaction(
    chain: ChainProtocol,
    tx: Transaction
  ): Promise<Transaction> {
    const protection = this.protectionSettings.get(chain);
    if (!protection || !protection.enabled) {
      return tx;
    }

    // 应用保护措施
    const protectedTx = { ...tx };

    // 添加滑点保护
    if (protection.maxSlippage > 0) {
      protectedTx.data = this.addSlippageProtection(
        tx.data || '',
        protection.maxSlippage
      );
    }

    // 启用私有mempool
    if (protection.privateMempool) {
      protectedTx.data = this.enablePrivateMempool(protectedTx.data || '');
    }

    // 启用Flashbots
    if (protection.flashbotsEnabled && chain === ChainProtocol.EVM) {
      protectedTx.data = this.enableFlashbots(protectedTx.data || '');
    }

    return protectedTx;
  }

  private addSlippageProtection(data: string, maxSlippage: number): string {
    // 实际实现需要根据具体协议修改交易数据
    return data;
  }

  private enablePrivateMempool(data: string): string {
    // 实际实现需要添加私有mempool标记
    return data;
  }

  private enableFlashbots(data: string): string {
    // 实际实现需要添加Flashbots包装
    return data;
  }

  updateProtectionSettings(
    chain: ChainProtocol,
    settings: Partial<MEVProtection>
  ): void {
    const currentSettings = this.protectionSettings.get(chain);
    if (currentSettings) {
      this.protectionSettings.set(chain, {
        ...currentSettings,
        ...settings,
      });
    }
  }

  getProtectionSettings(chain: ChainProtocol): MEVProtection | undefined {
    return this.protectionSettings.get(chain);
  }
} 