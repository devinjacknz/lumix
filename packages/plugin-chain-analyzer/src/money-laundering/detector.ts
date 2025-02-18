import { ProfileManager } from '../profile/manager';
import {
  MoneyLaunderingError,
  TransactionFlow,
  FlowPattern,
  MoneyLaunderingAlert,
  FlowAnalysisConfig,
  AlertConfig,
  DetectionResult
} from './types';
import { FlowAnalyzer } from './analyzer';
import { PatternMatcher } from './matcher';
import { AlertGenerator } from './alert';

export interface DetectorConfig {
  profileManager: ProfileManager;
  flowConfig: FlowAnalysisConfig;
  alertConfig: AlertConfig;
}

export class MoneyLaunderingDetector {
  private config: Required<DetectorConfig>;
  private profileManager: ProfileManager;
  private flowAnalyzer: FlowAnalyzer;
  private patternMatcher: PatternMatcher;
  private alertGenerator: AlertGenerator;

  constructor(config: DetectorConfig) {
    this.config = {
      profileManager: config.profileManager,
      flowConfig: {
        minFlowValue: config.flowConfig.minFlowValue,
        maxHops: config.flowConfig.maxHops || 5,
        timeWindowDays: config.flowConfig.timeWindowDays || 30,
        minPatternConfidence: config.flowConfig.minPatternConfidence || 0.8,
        excludedAddresses: config.flowConfig.excludedAddresses || []
      },
      alertConfig: {
        minSeverityScore: config.alertConfig.minSeverityScore || 0.7,
        maxAlertsPerAddress: config.alertConfig.maxAlertsPerAddress || 10,
        deduplicationWindow: config.alertConfig.deduplicationWindow || 24 * 60 * 60 * 1000, // 24小时
        notificationThreshold: config.alertConfig.notificationThreshold || {
          low: 0.7,
          medium: 0.8,
          high: 0.9,
          critical: 0.95
        }
      }
    };

    this.profileManager = config.profileManager;
    this.flowAnalyzer = new FlowAnalyzer(this.config.flowConfig);
    this.patternMatcher = new PatternMatcher();
    this.alertGenerator = new AlertGenerator(this.config.alertConfig);
  }

  /**
   * 分析地址的交易流并检测洗钱模式
   */
  async analyzeAddress(
    address: string,
    startTime?: number,
    endTime?: number
  ): Promise<DetectionResult> {
    try {
      // 获取地址画像
      const profile = await this.profileManager.getProfile(address);

      // 分析交易流
      const flows = await this.flowAnalyzer.analyzeFlows(
        address,
        startTime,
        endTime
      );

      // 检测可疑模式
      const patterns = await this.detectPatterns(flows, profile.riskScore);

      // 生成警报
      const alerts = await this.generateAlerts(patterns, [profile]);

      // 计算统计信息
      const stats = this.calculateStats(flows, patterns);

      return { alerts, stats };
    } catch (error) {
      throw new MoneyLaunderingError(
        `Failed to analyze address ${address}`,
        { cause: error }
      );
    }
  }

  /**
   * 分析地址群组的交易流
   */
  async analyzeAddressGroup(
    addresses: string[],
    startTime?: number,
    endTime?: number
  ): Promise<DetectionResult> {
    try {
      // 获取所有地址的画像
      const profiles = await Promise.all(
        addresses.map(addr => this.profileManager.getProfile(addr))
      );

      // 分析交易流
      const allFlows = await Promise.all(
        addresses.map(addr =>
          this.flowAnalyzer.analyzeFlows(addr, startTime, endTime)
        )
      );

      // 合并交易流
      const mergedFlows = this.mergeFlows(allFlows.flat());

      // 检测可疑模式
      const patterns = await this.detectPatterns(
        mergedFlows,
        Math.max(...profiles.map(p => p.riskScore))
      );

      // 生成警报
      const alerts = await this.generateAlerts(patterns, profiles);

      // 计算统计信息
      const stats = this.calculateStats(mergedFlows, patterns);

      return { alerts, stats };
    } catch (error) {
      throw new MoneyLaunderingError(
        `Failed to analyze address group`,
        { cause: error }
      );
    }
  }

  /**
   * 检测交易流中的可疑模式
   */
  private async detectPatterns(
    flows: TransactionFlow[],
    baseRiskScore: number
  ): Promise<FlowPattern[]> {
    const patterns: FlowPattern[] = [];

    // 检测分层模式
    const layeringPatterns = await this.patternMatcher.detectLayering(
      flows,
      baseRiskScore
    );
    patterns.push(...layeringPatterns);

    // 检测结构化模式
    const structuringPatterns = await this.patternMatcher.detectStructuring(
      flows,
      baseRiskScore
    );
    patterns.push(...structuringPatterns);

    // 检测混合模式
    const mixingPatterns = await this.patternMatcher.detectMixing(
      flows,
      baseRiskScore
    );
    patterns.push(...mixingPatterns);

    // 检测分散模式
    const smurfingPatterns = await this.patternMatcher.detectSmurfing(
      flows,
      baseRiskScore
    );
    patterns.push(...smurfingPatterns);

    // 检测循环模式
    const cyclingPatterns = await this.patternMatcher.detectCycling(
      flows,
      baseRiskScore
    );
    patterns.push(...cyclingPatterns);

    // 过滤低置信度的模式
    return patterns.filter(p =>
      p.score >= this.config.flowConfig.minPatternConfidence
    );
  }

  /**
   * 生成洗钱警报
   */
  private async generateAlerts(
    patterns: FlowPattern[],
    profiles: AddressProfile[]
  ): Promise<MoneyLaunderingAlert[]> {
    return this.alertGenerator.generateAlerts(patterns, profiles);
  }

  /**
   * 合并交易流
   */
  private mergeFlows(flows: TransactionFlow[]): TransactionFlow[] {
    // 按时间戳排序
    const sortedFlows = flows.sort((a, b) => a.timestamp - b.timestamp);

    // 去重
    const uniqueFlows = new Map<string, TransactionFlow>();
    for (const flow of sortedFlows) {
      const key = `${flow.txHash}:${flow.from}:${flow.to}`;
      if (!uniqueFlows.has(key)) {
        uniqueFlows.set(key, flow);
      }
    }

    return Array.from(uniqueFlows.values());
  }

  /**
   * 计算统计信息
   */
  private calculateStats(
    flows: TransactionFlow[],
    patterns: FlowPattern[]
  ): DetectionResult['stats'] {
    // 计算总价值
    const totalValue = flows.reduce(
      (sum, flow) => sum + flow.amount,
      BigInt(0)
    );

    // 统计唯一地址
    const uniqueAddresses = new Set(
      flows.flatMap(flow => [flow.from, flow.to])
    );

    // 计算模式分布
    const patternDistribution: Record<FlowPattern['type'], number> = {
      layering: 0,
      structuring: 0,
      mixing: 0,
      smurfing: 0,
      cycling: 0
    };
    for (const pattern of patterns) {
      patternDistribution[pattern.type]++;
    }

    // 计算平均跳数
    const totalHops = patterns.reduce(
      (sum, pattern) => sum + pattern.flows.length,
      0
    );
    const averageHops = patterns.length > 0
      ? totalHops / patterns.length
      : 0;

    // 计算时间范围
    const timestamps = flows.map(flow => flow.timestamp);
    const timeRange = {
      start: Math.min(...timestamps),
      end: Math.max(...timestamps)
    };

    return {
      totalFlows: flows.length,
      totalValue,
      uniqueAddresses: uniqueAddresses.size,
      patternDistribution,
      averageHops,
      timeRange
    };
  }
} 