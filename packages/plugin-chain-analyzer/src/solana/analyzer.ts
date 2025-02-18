import { ChainAdapter, ChainProtocol, AnalysisResult } from '@lumix/plugin-chain-adapter';
import { Connection, PublicKey, ConfirmedSignatureInfo } from '@solana/web3.js';
import { ConsultationMode } from '@lumix/core';
import { formatAnalysisResult } from '../utils';
import { AnalysisCache } from '../cache';
import { MetricsAnalyzer, TokenMetrics, ProgramMetrics, NetworkMetrics } from './metrics';
import { 
  AnalyzerError, 
  ErrorCode, 
  NetworkError, 
  ProgramError, 
  MetricsError,
  handleError 
} from '../errors';
import { errorMonitor } from '../monitoring';

type Finding = {
  type: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
};

interface ProgramInteractionHistory {
  totalTransactions: number;
  uniqueUsers: number;
  recentTransactions: ConfirmedSignatureInfo[];
  interactionPattern: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

interface DetailedAnalysis {
  contractAnalysis: AnalysisResult;
  interactionHistory: ProgramInteractionHistory;
  tokenMetrics?: TokenMetrics;
  programMetrics: ProgramMetrics;
  networkMetrics: NetworkMetrics;
}

export class SolanaAnalyzer {
  private connection: Connection;
  private adapter: ChainAdapter;
  private mode: ConsultationMode;
  private cache: AnalysisCache;
  private metricsAnalyzer: MetricsAnalyzer;

  constructor(adapter: ChainAdapter, mode: ConsultationMode = 'expert') {
    if (adapter.protocol !== ChainProtocol.SOLANA) {
      throw new AnalyzerError(
        'Invalid chain adapter protocol',
        ErrorCode.INVALID_ADAPTER,
        { protocol: adapter.protocol }
      );
    }
    this.adapter = adapter;
    this.mode = mode;
    this.connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    this.cache = new AnalysisCache();
    this.metricsAnalyzer = new MetricsAnalyzer(this.connection);
  }

  async analyzeContract(address: string): Promise<AnalysisResult> {
    const startTime = Date.now();
    try {
      const programId = new PublicKey(address);
      
      // 获取程序账户信息
      const accountInfo = await this.connection.getAccountInfo(programId)
        .catch(error => {
          throw new NetworkError(
            `Failed to fetch account info: ${error.message}`,
            { address },
            error
          );
        });

      if (!accountInfo) {
        throw new ProgramError(
          'Program not found',
          { address }
        );
      }

      // 分析程序数据
      const findings: Finding[] = [];
      
      // 检查程序大小
      if (accountInfo.data.length > 1024 * 1024) {
        findings.push({
          type: 'PROGRAM_SIZE',
          description: '程序大小超过1MB，可能影响性能',
          severity: 'MEDIUM'
        });
      }

      // 检查程序所有者
      if (!accountInfo.owner.equals(new PublicKey('BPFLoaderUpgradeab1e1111111111111111111111111'))) {
        findings.push({
          type: 'PROGRAM_OWNER',
          description: '程序不是由标准BPF加载器部署',
          severity: 'HIGH'
        });
      }

      // 生成分析结果
      const riskLevel = findings.some(f => f.severity === 'HIGH') ? 'HIGH' as const : 
                       findings.some(f => f.severity === 'MEDIUM') ? 'MEDIUM' as const : 'LOW' as const;

      const result: AnalysisResult = {
        riskLevel,
        findings,
        recommendations: this.generateRecommendations(findings)
      };

      return {
        ...result,
        formattedOutput: formatAnalysisResult(result, this.mode)
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const wrappedError = error instanceof AnalyzerError ? error : handleError(error);
      errorMonitor.trackError(wrappedError, responseTime);
      throw wrappedError;
    }
  }

  private generateRecommendations(findings: Finding[]): string[] {
    const recommendations: string[] = [];
    
    findings.forEach(finding => {
      switch (finding.type) {
        case 'PROGRAM_SIZE':
          recommendations.push(
            this.mode === 'beginner' 
              ? '建议优化代码使其更小，这样运行起来会更快'
              : '考虑优化程序代码以减小大小，提高执行效率'
          );
          break;
        case 'PROGRAM_OWNER':
          recommendations.push(
            this.mode === 'beginner'
              ? '需要使用官方认可的方式重新部署程序，以确保安全性'
              : '建议使用标准BPF加载器重新部署程序，确保合规性和安全性'
          );
          break;
        // 添加更多建议
      }
    });

    return recommendations;
  }

  async analyzeMEV(startBlock: number, endBlock: number): Promise<any> {
    // Solana MEV 分析实现
    // TODO: 实现 MEV 检测逻辑
    throw new Error('MEV analysis not implemented for Solana');
  }

  setMode(mode: ConsultationMode): void {
    this.mode = mode;
  }

  async analyzeProgramInteractions(address: string, days: number = 30): Promise<ProgramInteractionHistory> {
    const startTime = Date.now();
    try {
      const programId = new PublicKey(address);
      const now = new Date();
      const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      // 获取程序的最近交易签名
      const signatures = await this.connection.getSignaturesForAddress(
        programId,
        { limit: 1000 }
      ).catch(error => {
        throw new NetworkError(
          `Failed to fetch signatures: ${error.message}`,
          { address, days },
          error
        );
      });

      // 过滤并分析交易
      const recentTxs = signatures.filter((sig: ConfirmedSignatureInfo) => 
        sig.blockTime && new Date(sig.blockTime * 1000) >= startTime
      );

      // 统计唯一用户
      const uniqueUsers = new Set(
        recentTxs.map((tx: ConfirmedSignatureInfo) => tx.signature)
      ).size;

      // 计算交互模式
      const daily = this.calculateDailyAverage(recentTxs);
      const weekly = daily * 7;
      const monthly = daily * 30;

      return {
        totalTransactions: recentTxs.length,
        uniqueUsers,
        recentTransactions: recentTxs.slice(0, 10),
        interactionPattern: {
          daily,
          weekly,
          monthly
        }
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const wrappedError = error instanceof AnalyzerError ? error : handleError(error);
      errorMonitor.trackError(wrappedError, responseTime);
      throw wrappedError;
    }
  }

  private calculateDailyAverage(transactions: ConfirmedSignatureInfo[]): number {
    if (transactions.length === 0) return 0;

    const oldestTx = Math.min(...transactions.map(tx => tx.blockTime || 0));
    const newestTx = Math.max(...transactions.map(tx => tx.blockTime || 0));
    const daysDiff = (newestTx - oldestTx) / (24 * 60 * 60);

    return daysDiff > 0 ? transactions.length / daysDiff : transactions.length;
  }

  async getDetailedAnalysis(address: string): Promise<DetailedAnalysis> {
    const startTime = Date.now();
    try {
      const cacheKey = `detailed_analysis:${address}`;
      const cachedResult = this.cache.get<DetailedAnalysis>(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      const programId = new PublicKey(address);

      const [
        contractAnalysis,
        interactionHistory,
        programMetrics,
        networkMetrics
      ] = await Promise.all([
        this.analyzeContract(address).catch(error => {
          throw new AnalyzerError(
            `Contract analysis failed: ${error.message}`,
            ErrorCode.ANALYSIS_FAILED,
            { address },
            error
          );
        }),
        this.analyzeProgramInteractions(address),
        this.metricsAnalyzer.analyzeProgramMetrics(programId),
        this.metricsAnalyzer.getNetworkMetrics()
      ]);

      // 尝试获取代币指标
      let tokenMetrics: TokenMetrics | undefined;
      try {
        tokenMetrics = await this.metricsAnalyzer.analyzeTokenMetrics(programId);
      } catch (error) {
        // 记录错误但不中断分析
        console.warn(`Token metrics analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      this.enrichAnalysisWithMetrics(
        contractAnalysis,
        programMetrics,
        networkMetrics
      );

      const result: DetailedAnalysis = {
        contractAnalysis,
        interactionHistory,
        tokenMetrics,
        programMetrics,
        networkMetrics
      };

      // 缓存结果
      try {
        this.cache.set(cacheKey, result, 5 * 60 * 1000);
      } catch (error) {
        console.warn(`Failed to cache analysis result: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const wrappedError = error instanceof AnalyzerError ? error : handleError(error);
      errorMonitor.trackError(wrappedError, responseTime);
      throw wrappedError;
    }
  }

  private enrichAnalysisWithMetrics(
    analysis: AnalysisResult,
    programMetrics: ProgramMetrics,
    networkMetrics: NetworkMetrics
  ): void {
    // 分析失败率
    if (programMetrics.failureRate > 0.1) { // 10% 失败率
      analysis.findings.push({
        type: 'PROGRAM_RELIABILITY',
        description: `程序失败率较高 (${(programMetrics.failureRate * 100).toFixed(2)}%)`,
        severity: 'HIGH'
      });
    }

    // 分析计算单元使用
    if (programMetrics.averageComputeUnits > 200000) { // 200k CU
      analysis.findings.push({
        type: 'COMPUTE_UNITS',
        description: '程序平均计算单元消耗较高，可能导致交易成本增加',
        severity: 'MEDIUM'
      });
    }

    // 分析指令多样性
    if (programMetrics.uniqueInstructions.size === 1) {
      analysis.findings.push({
        type: 'INSTRUCTION_DIVERSITY',
        description: '程序只有单一指令，功能可能过于简单',
        severity: 'LOW'
      });
    }

    // 根据新发现更新风险等级
    const hasHighSeverity = analysis.findings.some(f => f.severity === 'HIGH');
    const hasMediumSeverity = analysis.findings.some(f => f.severity === 'MEDIUM');
    
    if (hasHighSeverity) {
      analysis.riskLevel = 'HIGH';
    } else if (hasMediumSeverity && analysis.riskLevel === 'LOW') {
      analysis.riskLevel = 'MEDIUM';
    }
  }

  // 清理缓存
  cleanup(): void {
    this.cache.cleanup();
  }

  // 获取缓存统计信息
  getCacheStats() {
    return this.cache.getStats();
  }

  // 获取错误统计信息
  getErrorMetrics() {
    return errorMonitor.getMetrics();
  }

  // 获取错误率
  getErrorRate(timeWindowMs?: number) {
    return errorMonitor.getErrorRate(timeWindowMs);
  }
} 