import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';

export interface TokenMetrics {
  supply: number;
  holders: number;
  transferVolume24h: number;
  uniqueTransfers24h: number;
}

export interface ProgramMetrics {
  totalInstructions: number;
  uniqueInstructions: Set<string>;
  instructionFrequency: Map<string, number>;
  averageComputeUnits: number;
  failureRate: number;
}

export interface NetworkMetrics {
  tps: number;
  averageBlockTime: number;
  currentSlot: number;
  validatorCount: number;
}

export class MetricsAnalyzer {
  constructor(private connection: Connection) {}

  async analyzeTokenMetrics(mint: PublicKey): Promise<TokenMetrics> {
    try {
      // 获取代币信息
      const tokenSupply = await this.connection.getTokenSupply(mint);
      
      // 获取最近24小时的转账
      const signatures = await this.connection.getSignaturesForAddress(mint, {
        limit: 1000,
        before: new Date().getTime()
      });

      const recentSignatures = signatures.filter(sig => 
        sig.blockTime && 
        (Date.now() - sig.blockTime * 1000) <= 24 * 60 * 60 * 1000
      );

      const uniqueAddresses = new Set<string>();
      let transferVolume = 0;

      // 分析转账
      for (const sig of recentSignatures) {
        const tx = await this.connection.getParsedTransaction(sig.signature);
        if (!tx?.meta) continue;

        // 分析代币转账
        tx.meta.postTokenBalances?.forEach(balance => {
          if (balance.mint === mint.toBase58()) {
            uniqueAddresses.add(balance.owner);
            transferVolume += Number(balance.uiTokenAmount.amount);
          }
        });
      }

      return {
        supply: Number(tokenSupply.value.uiAmount),
        holders: uniqueAddresses.size,
        transferVolume24h: transferVolume,
        uniqueTransfers24h: recentSignatures.length
      };
    } catch (error) {
      throw new Error(`Failed to analyze token metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async analyzeProgramMetrics(programId: PublicKey, sampleSize: number = 100): Promise<ProgramMetrics> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(programId, {
        limit: sampleSize
      });

      const metrics = {
        totalInstructions: 0,
        uniqueInstructions: new Set<string>(),
        instructionFrequency: new Map<string, number>(),
        averageComputeUnits: 0,
        failureRate: 0
      };

      let totalComputeUnits = 0;
      let failedTransactions = 0;

      for (const sig of signatures) {
        const tx = await this.connection.getParsedTransaction(sig.signature);
        if (!tx?.meta) continue;

        // 分析交易状态
        if (tx.meta.err) {
          failedTransactions++;
          continue;
        }

        // 分析指令
        tx.transaction.message.instructions.forEach(ix => {
          if (ix.programId.equals(programId)) {
            metrics.totalInstructions++;
            const ixName = this.getInstructionName(ix);
            metrics.uniqueInstructions.add(ixName);
            metrics.instructionFrequency.set(
              ixName,
              (metrics.instructionFrequency.get(ixName) || 0) + 1
            );
          }
        });

        // 计算平均计算单元
        if (tx.meta.computeUnitsConsumed) {
          totalComputeUnits += tx.meta.computeUnitsConsumed;
        }
      }

      metrics.averageComputeUnits = totalComputeUnits / signatures.length;
      metrics.failureRate = failedTransactions / signatures.length;

      return metrics;
    } catch (error) {
      throw new Error(`Failed to analyze program metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getNetworkMetrics(): Promise<NetworkMetrics> {
    try {
      const [performance, epoch, validators] = await Promise.all([
        this.connection.getRecentPerformanceSamples(1),
        this.connection.getEpochInfo(),
        this.connection.getVoteAccounts()
      ]);

      return {
        tps: performance[0]?.numTransactions / performance[0]?.samplePeriodSecs || 0,
        averageBlockTime: performance[0]?.samplePeriodSecs / performance[0]?.numSlots || 0,
        currentSlot: epoch.absoluteSlot,
        validatorCount: validators.current.length + validators.delinquent.length
      };
    } catch (error) {
      throw new Error(`Failed to get network metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getInstructionName(ix: any): string {
    // TODO: 实现指令名称解析
    return ix.data ? ix.data.slice(0, 8).toString('hex') : 'unknown';
  }
} 