import { BaseError } from '@lumix/core';
import { KnowledgeManager } from '@lumix/core';
import {
  ProfileError,
  AddressProfile,
  TransactionActivity,
  ProfileFilter,
  ProfileUpdateOptions,
  BehaviorPattern,
  AddressTag
} from './types';
import { PatternDetector } from './detector';
import { RiskScorer } from './scorer';

export interface ProfileManagerConfig {
  knowledgeManager: KnowledgeManager;
  chainId: number;
  updateInterval?: number; // 毫秒
  maxProfiles?: number;
  defaultUpdateOptions?: ProfileUpdateOptions;
}

export class ProfileManager {
  private config: Required<ProfileManagerConfig>;
  private knowledgeManager: KnowledgeManager;
  private patternDetector: PatternDetector;
  private riskScorer: RiskScorer;
  private profiles: Map<string, AddressProfile>;
  private lastUpdate: Map<string, number>;

  constructor(config: ProfileManagerConfig) {
    this.config = {
      knowledgeManager: config.knowledgeManager,
      chainId: config.chainId,
      updateInterval: config.updateInterval || 3600000, // 1小时
      maxProfiles: config.maxProfiles || 10000,
      defaultUpdateOptions: config.defaultUpdateOptions || {
        forceUpdate: false,
        updateDepth: 1000,
        includePending: false,
        maxTransactions: 1000
      }
    };

    this.knowledgeManager = config.knowledgeManager;
    this.patternDetector = new PatternDetector();
    this.riskScorer = new RiskScorer();
    this.profiles = new Map();
    this.lastUpdate = new Map();
  }

  /**
   * 获取地址画像
   */
  async getProfile(
    address: string,
    options: ProfileUpdateOptions = {}
  ): Promise<AddressProfile> {
    const mergedOptions = { ...this.config.defaultUpdateOptions, ...options };
    const lastUpdateTime = this.lastUpdate.get(address) || 0;
    const needsUpdate = mergedOptions.forceUpdate ||
      Date.now() - lastUpdateTime > this.config.updateInterval;

    if (needsUpdate) {
      await this.updateProfile(address, mergedOptions);
    }

    const profile = this.profiles.get(address);
    if (!profile) {
      throw new ProfileError(`Profile not found for address: ${address}`);
    }

    return profile;
  }

  /**
   * 更新地址画像
   */
  async updateProfile(
    address: string,
    options: ProfileUpdateOptions = {}
  ): Promise<void> {
    try {
      const mergedOptions = { ...this.config.defaultUpdateOptions, ...options };
      
      // 获取历史交易
      const transactions = await this.fetchTransactionHistory(
        address,
        mergedOptions
      );

      // 获取当前状态
      const currentState = await this.fetchCurrentState(address);

      // 分析行为模式
      const patterns = await this.patternDetector.detectPatterns(
        address,
        transactions
      );

      // 计算风险评分
      const riskScore = this.riskScorer.calculateRiskScore(
        patterns,
        transactions,
        currentState
      );

      // 构建或更新画像
      const profile = this.buildProfile(
        address,
        transactions,
        patterns,
        currentState,
        riskScore
      );

      // 存储画像
      await this.saveProfile(profile);

      // 更新时间戳
      this.lastUpdate.set(address, Date.now());
    } catch (error) {
      throw new ProfileError(`Failed to update profile for ${address}`, {
        cause: error
      });
    }
  }

  /**
   * 批量更新地址画像
   */
  async batchUpdateProfiles(
    addresses: string[],
    options: ProfileUpdateOptions = {}
  ): Promise<void> {
    const promises = addresses.map(address =>
      this.updateProfile(address, options)
    );
    await Promise.all(promises);
  }

  /**
   * 搜索地址画像
   */
  async searchProfiles(filter: ProfileFilter): Promise<AddressProfile[]> {
    const profiles = Array.from(this.profiles.values());
    return profiles.filter(profile => this.matchesFilter(profile, filter));
  }

  /**
   * 添加地址标签
   */
  async addTag(
    address: string,
    tag: AddressTag
  ): Promise<void> {
    const profile = await this.getProfile(address);
    profile.tags.push(tag);
    await this.saveProfile(profile);
  }

  /**
   * 移除地址标签
   */
  async removeTag(
    address: string,
    tagName: string
  ): Promise<void> {
    const profile = await this.getProfile(address);
    profile.tags = profile.tags.filter(tag => tag.tag !== tagName);
    await this.saveProfile(profile);
  }

  /**
   * 获取相似地址
   */
  async findSimilarAddresses(
    address: string,
    limit: number = 10
  ): Promise<Array<{ address: string; similarity: number }>> {
    const profile = await this.getProfile(address);
    const profileVector = await this.vectorizeProfile(profile);
    
    const results = await this.knowledgeManager.searchSimilar(
      'address_profiles',
      profileVector,
      limit
    );

    return results.map(result => ({
      address: result.id,
      similarity: result.score
    }));
  }

  /**
   * 清理过期画像
   */
  private cleanupProfiles(): void {
    const now = Date.now();
    for (const [address, lastUpdate] of this.lastUpdate.entries()) {
      if (now - lastUpdate > this.config.updateInterval * 2) {
        this.profiles.delete(address);
        this.lastUpdate.delete(address);
      }
    }
  }

  /**
   * 获取历史交易
   */
  private async fetchTransactionHistory(
    address: string,
    options: ProfileUpdateOptions
  ): Promise<TransactionActivity[]> {
    // TODO: 实现交易历史获取逻辑
    return [];
  }

  /**
   * 获取当前状态
   */
  private async fetchCurrentState(
    address: string
  ): Promise<any> {
    // TODO: 实现当前状态获取逻辑
    return {};
  }

  /**
   * 构建地址画像
   */
  private buildProfile(
    address: string,
    transactions: TransactionActivity[],
    patterns: BehaviorPattern[],
    currentState: any,
    riskScore: number
  ): AddressProfile {
    // TODO: 实现画像构建逻辑
    return {
      address,
      firstSeen: 0,
      lastActive: 0,
      totalTransactions: 0,
      nonce: 0,
      balance: BigInt(0),
      transactionStats: {
        sent: 0,
        received: 0,
        failed: 0,
        avgGasUsed: BigInt(0),
        totalGasSpent: BigInt(0)
      },
      tokenBalances: [],
      contractInteractions: [],
      tags: [],
      patterns,
      riskScore,
      metadata: {}
    };
  }

  /**
   * 保存地址画像
   */
  private async saveProfile(profile: AddressProfile): Promise<void> {
    // 检查容量限制
    if (this.profiles.size >= this.config.maxProfiles) {
      this.cleanupProfiles();
      if (this.profiles.size >= this.config.maxProfiles) {
        throw new ProfileError('Maximum profiles limit reached');
      }
    }

    // 保存到内存
    this.profiles.set(profile.address, profile);

    // 保存到向量存储
    const vector = await this.vectorizeProfile(profile);
    await this.knowledgeManager.store(
      'address_profiles',
      profile.address,
      vector,
      profile
    );
  }

  /**
   * 将画像转换为向量
   */
  private async vectorizeProfile(profile: AddressProfile): Promise<number[]> {
    // TODO: 实现画像向量化逻辑
    return [];
  }

  /**
   * 检查画像是否匹配过滤条件
   */
  private matchesFilter(
    profile: AddressProfile,
    filter: ProfileFilter
  ): boolean {
    if (filter.minTransactions && profile.totalTransactions < filter.minTransactions) {
      return false;
    }

    if (filter.minBalance && profile.balance < filter.minBalance) {
      return false;
    }

    if (filter.tags && !filter.tags.every(tag =>
      profile.tags.some(t => t.tag === tag)
    )) {
      return false;
    }

    if (filter.patterns && !filter.patterns.every(pattern =>
      profile.patterns.some(p => p.type === pattern)
    )) {
      return false;
    }

    if (filter.riskScoreRange) {
      const { min, max } = filter.riskScoreRange;
      if (profile.riskScore < min || profile.riskScore > max) {
        return false;
      }
    }

    if (filter.dateRange) {
      const { start, end } = filter.dateRange;
      if (profile.lastActive < start || profile.firstSeen > end) {
        return false;
      }
    }

    return true;
  }
} 