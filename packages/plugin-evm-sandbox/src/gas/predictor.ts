import { Transaction } from '@ethereumjs/tx';
import { EVMError } from '../sandbox';
import { Address } from '@ethereumjs/util';

export interface GasEstimationResult {
  baseFee: bigint;
  gasLimit: bigint;
  priorityFee?: bigint;
  confidence: number; // 0-1 范围内的预测置信度
  breakdown?: {
    intrinsicGas: bigint; // 交易基础 gas 消耗
    executionGas: bigint; // 执行代码的 gas 消耗
    accessListGas: bigint; // 访问列表 gas 消耗
    storageGas: bigint; // 存储操作 gas 消耗
  };
}

export interface GasUsageStats {
  opcode: string;
  count: number;
  totalGas: bigint;
  avgGas: bigint;
}

export interface ContractGasProfile {
  address: string;
  methodStats: Map<string, {
    callCount: number;
    avgGasUsed: bigint;
    minGasUsed: bigint;
    maxGasUsed: bigint;
    lastUpdated: Date;
    gasUsageByOpcode: GasUsageStats[];
  }>;
}

export interface GasPredictorConfig {
  historicalDataSize?: number; // 保留多少历史数据用于分析
  updateInterval?: number; // 多久更新一次统计数据（毫秒）
  confidenceThreshold?: number; // 最小置信度阈值
  maxProfilesPerContract?: number; // 每个合约保留多少方法的 profile
}

export class GasPredictor {
  private contractProfiles: Map<string, ContractGasProfile>;
  private config: Required<GasPredictorConfig>;
  private lastUpdate: Date;

  constructor(config: GasPredictorConfig = {}) {
    this.contractProfiles = new Map();
    this.config = {
      historicalDataSize: config.historicalDataSize || 1000,
      updateInterval: config.updateInterval || 3600000, // 1小时
      confidenceThreshold: config.confidenceThreshold || 0.8,
      maxProfilesPerContract: config.maxProfilesPerContract || 100
    };
    this.lastUpdate = new Date();
  }

  /**
   * 预测交易的 gas 消耗
   */
  async predictGasUsage(
    tx: Transaction,
    contractAddress?: string | Address
  ): Promise<GasEstimationResult> {
    try {
      // 计算基础 gas 消耗
      const intrinsicGas = this.calculateIntrinsicGas(tx);
      
      // 如果是合约调用，尝试从历史数据预测
      let executionGas = 0n;
      let confidence = 1;
      
      if (contractAddress) {
        const addr = typeof contractAddress === 'string' ? contractAddress : contractAddress.toString();
        const methodId = tx.data.slice(0, 4).toString('hex');
        const profile = this.getContractProfile(addr, methodId);
        
        if (profile) {
          executionGas = profile.avgGasUsed;
          // 根据历史数据的稳定性计算置信度
          confidence = this.calculateConfidence(profile);
        } else {
          // 没有历史数据，使用保守估计
          executionGas = 100000n; // 默认值
          confidence = 0.5;
        }
      }

      // 计算访问列表 gas
      const accessListGas = this.calculateAccessListGas(tx);

      // 预估存储操作 gas
      const storageGas = this.estimateStorageGas(tx);

      // 计算总 gas 限制，包含一定的缓冲
      const totalGas = intrinsicGas + executionGas + accessListGas + storageGas;
      const gasLimit = totalGas + (totalGas * 10n) / 100n; // 添加 10% 缓冲

      return {
        baseFee: totalGas,
        gasLimit,
        priorityFee: this.estimatePriorityFee(),
        confidence,
        breakdown: {
          intrinsicGas,
          executionGas,
          accessListGas,
          storageGas
        }
      };
    } catch (error) {
      throw new EVMError(`Failed to predict gas usage: ${error.message}`);
    }
  }

  /**
   * 更新合约的 gas 使用统计
   */
  updateContractProfile(
    contractAddress: string | Address,
    methodId: string,
    gasUsed: bigint,
    opcodeStats: GasUsageStats[]
  ): void {
    const addr = typeof contractAddress === 'string' ? contractAddress : contractAddress.toString();
    let profile = this.contractProfiles.get(addr);

    if (!profile) {
      profile = {
        address: addr,
        methodStats: new Map()
      };
      this.contractProfiles.set(addr, profile);
    }

    let methodStats = profile.methodStats.get(methodId);
    if (!methodStats) {
      methodStats = {
        callCount: 0,
        avgGasUsed: 0n,
        minGasUsed: gasUsed,
        maxGasUsed: gasUsed,
        lastUpdated: new Date(),
        gasUsageByOpcode: []
      };
      profile.methodStats.set(methodId, methodStats);
    }

    // 更新统计数据
    methodStats.callCount++;
    methodStats.avgGasUsed = (methodStats.avgGasUsed * BigInt(methodStats.callCount - 1) + gasUsed) / BigInt(methodStats.callCount);
    methodStats.minGasUsed = gasUsed < methodStats.minGasUsed ? gasUsed : methodStats.minGasUsed;
    methodStats.maxGasUsed = gasUsed > methodStats.maxGasUsed ? gasUsed : methodStats.maxGasUsed;
    methodStats.lastUpdated = new Date();
    methodStats.gasUsageByOpcode = this.mergeOpcodeStats(methodStats.gasUsageByOpcode, opcodeStats);

    // 清理过期数据
    this.cleanupOldData();
  }

  /**
   * 获取合约的 gas 使用统计
   */
  getContractProfile(
    contractAddress: string,
    methodId?: string
  ): ContractGasProfile | null {
    const profile = this.contractProfiles.get(contractAddress);
    if (!profile) return null;

    if (methodId) {
      const methodStats = profile.methodStats.get(methodId);
      if (!methodStats) return null;
    }

    return profile;
  }

  private calculateIntrinsicGas(tx: Transaction): bigint {
    // 基础交易 gas
    let gas = 21000n;

    // 数据 gas
    for (const byte of tx.data) {
      gas += byte === 0 ? 4n : 16n; // 0 字节消耗 4 gas，非 0 字节消耗 16 gas
    }

    return gas;
  }

  private calculateAccessListGas(tx: Transaction): bigint {
    if ('accessList' in tx) {
      let gas = 0n;
      for (const access of tx.accessList) {
        gas += 2400n; // 每个地址消耗 2400 gas
        gas += BigInt(access.storageKeys.length) * 1900n; // 每个存储键消耗 1900 gas
      }
      return gas;
    }
    return 0n;
  }

  private estimateStorageGas(tx: Transaction): bigint {
    // 简单估计：假设每个非零数据字节可能导致一次存储写入
    let nonZeroBytes = 0;
    for (const byte of tx.data) {
      if (byte !== 0) nonZeroBytes++;
    }
    return BigInt(nonZeroBytes) * 20000n; // SSTORE 操作基础消耗 20000 gas
  }

  private estimatePriorityFee(): bigint {
    // 简单实现：返回固定值
    return 1500000000n; // 1.5 Gwei
  }

  private calculateConfidence(methodStats: any): number {
    const callCount = methodStats.callCount;
    const gasVariance = Number(methodStats.maxGasUsed - methodStats.minGasUsed);
    const avgGas = Number(methodStats.avgGasUsed);

    // 调用次数越多，置信度越高
    const callCountFactor = Math.min(callCount / 100, 1);
    
    // gas 波动越小，置信度越高
    const varianceFactor = Math.max(1 - (gasVariance / avgGas), 0);

    // 最近更新时间影响
    const timeFactor = Math.max(1 - (Date.now() - methodStats.lastUpdated.getTime()) / this.config.updateInterval, 0);

    return (callCountFactor * 0.4 + varianceFactor * 0.4 + timeFactor * 0.2);
  }

  private mergeOpcodeStats(
    existing: GasUsageStats[],
    newStats: GasUsageStats[]
  ): GasUsageStats[] {
    const merged = new Map<string, GasUsageStats>();
    
    // 合并现有统计
    for (const stat of existing) {
      merged.set(stat.opcode, { ...stat });
    }

    // 合并新统计
    for (const stat of newStats) {
      const existing = merged.get(stat.opcode);
      if (existing) {
        existing.count += stat.count;
        existing.totalGas += stat.totalGas;
        existing.avgGas = existing.totalGas / BigInt(existing.count);
      } else {
        merged.set(stat.opcode, { ...stat });
      }
    }

    return Array.from(merged.values());
  }

  private cleanupOldData(): void {
    const now = new Date();
    if (now.getTime() - this.lastUpdate.getTime() < this.config.updateInterval) {
      return;
    }

    for (const [addr, profile] of this.contractProfiles) {
      // 删除过期的方法统计
      for (const [methodId, stats] of profile.methodStats) {
        if (now.getTime() - stats.lastUpdated.getTime() > this.config.updateInterval * 2) {
          profile.methodStats.delete(methodId);
        }
      }

      // 如果方法数超过限制，删除最旧的
      if (profile.methodStats.size > this.config.maxProfilesPerContract) {
        const sortedMethods = Array.from(profile.methodStats.entries())
          .sort((a, b) => a[1].lastUpdated.getTime() - b[1].lastUpdated.getTime());
        
        while (profile.methodStats.size > this.config.maxProfilesPerContract) {
          const [methodId] = sortedMethods.shift()!;
          profile.methodStats.delete(methodId);
        }
      }

      // 如果合约没有方法统计了，删除整个合约配置
      if (profile.methodStats.size === 0) {
        this.contractProfiles.delete(addr);
      }
    }

    this.lastUpdate = now;
  }
} 