import { StorageAdapter } from '../storage/adapter';
import {
  RuleType,
  DiscoveryRule,
  DiscoveryConfig,
  DiscoveryResult,
  DiscoveredRelationship,
  RelationshipEvidence
} from './types';
import { NodeProperties, EdgeProperties, GraphFilter } from '../types';
import { RuleEngine } from './rules/engine';
import { Cache } from '@lumix/core';

export class RelationshipDiscoverer {
  private storage: StorageAdapter;
  private ruleEngine: RuleEngine;
  private cache: Cache;
  private config: Required<DiscoveryConfig>;
  private running: boolean;
  private taskQueue: Array<() => Promise<void>>;

  constructor(
    storage: StorageAdapter,
    config: DiscoveryConfig
  ) {
    this.storage = storage;
    this.ruleEngine = new RuleEngine();
    this.cache = new Cache();
    this.config = {
      rules: config.rules || [],
      minConfidence: config.minConfidence || 0.7,
      maxRelationships: config.maxRelationships || 1000,
      analysisTimeWindow: config.analysisTimeWindow || 30 * 24 * 60 * 60 * 1000, // 30天
      analysisDepth: config.analysisDepth || 3,
      batchSize: config.batchSize || 100,
      maxConcurrentTasks: config.maxConcurrentTasks || 5,
      taskTimeout: config.taskTimeout || 60000, // 1分钟
      retryCount: config.retryCount || 3,
      cacheResults: config.cacheResults ?? true,
      cacheExpiration: config.cacheExpiration || 24 * 60 * 60 * 1000, // 24小时
      persistResults: config.persistResults ?? true
    };
    this.running = false;
    this.taskQueue = [];

    // 初始化规则引擎
    this.initializeRuleEngine();
  }

  /**
   * 发现关系
   */
  async discoverRelationships(
    filter?: GraphFilter
  ): Promise<DiscoveryResult> {
    try {
      const startTime = Date.now();
      this.running = true;

      // 初始化统计信息
      const stats = this.initializeStats();

      // 获取需要分析的节点
      const nodes = await this.getTargetNodes(filter);
      stats.totalAnalyzed = nodes.length;

      // 创建分析任务
      const tasks = this.createAnalysisTasks(nodes);

      // 执行分析任务
      const relationships = await this.executeTasks(tasks, stats);

      // 过滤和排序结果
      const filteredRelationships = this.filterRelationships(relationships);

      // 持久化结果
      if (this.config.persistResults) {
        await this.persistRelationships(filteredRelationships);
      }

      // 更新统计信息
      stats.totalDiscovered = filteredRelationships.length;
      stats.timing = {
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime
      };

      return {
        relationships: filteredRelationships,
        stats
      };
    } catch (error) {
      throw error;
    } finally {
      this.running = false;
    }
  }

  /**
   * 添加规则
   */
  addRule(rule: DiscoveryRule): void {
    this.ruleEngine.addRule(rule);
    this.config.rules.push(rule);
  }

  /**
   * 移除规则
   */
  removeRule(ruleId: string): void {
    this.ruleEngine.removeRule(ruleId);
    this.config.rules = this.config.rules.filter(r => r.id !== ruleId);
  }

  /**
   * 获取规则
   */
  getRule(ruleId: string): DiscoveryRule | undefined {
    return this.config.rules.find(r => r.id === ruleId);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): DiscoveryRule[] {
    return this.config.rules;
  }

  /**
   * 停止发现
   */
  stop(): void {
    this.running = false;
    this.taskQueue = [];
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  private initializeRuleEngine(): void {
    // 注册内置规则
    this.registerCodeAnalysisRules();
    this.registerTransactionAnalysisRules();
    this.registerProtocolAnalysisRules();

    // 注册自定义规则
    for (const rule of this.config.rules) {
      this.ruleEngine.addRule(rule);
    }
  }

  private registerCodeAnalysisRules(): void {
    // TODO: 实现代码分析规则注册
  }

  private registerTransactionAnalysisRules(): void {
    // TODO: 实现交易分析规则注册
  }

  private registerProtocolAnalysisRules(): void {
    // TODO: 实现协议分析规则注册
  }

  private initializeStats(): DiscoveryResult['stats'] {
    const ruleStats = new Map();
    for (const type of Object.values(RuleType)) {
      ruleStats.set(type, {
        triggered: 0,
        succeeded: 0,
        failed: 0,
        avgConfidence: 0
      });
    }

    return {
      totalAnalyzed: 0,
      totalDiscovered: 0,
      ruleStats,
      timing: {
        startTime: 0,
        endTime: 0,
        duration: 0
      }
    };
  }

  private async getTargetNodes(
    filter?: GraphFilter
  ): Promise<NodeProperties[]> {
    const result = await this.storage.queryNodes({
      matchNode: {
        type: filter?.nodeTypes,
        properties: {}
      }
    });

    if (!result.success || !result.data) {
      throw new Error('Failed to get target nodes');
    }

    return result.data;
  }

  private createAnalysisTasks(
    nodes: NodeProperties[]
  ): Array<() => Promise<DiscoveredRelationship[]>> {
    const tasks: Array<() => Promise<DiscoveredRelationship[]>> = [];
    
    // 按批次创建任务
    for (let i = 0; i < nodes.length; i += this.config.batchSize) {
      const batch = nodes.slice(i, i + this.config.batchSize);
      tasks.push(() => this.analyzeBatch(batch));
    }

    return tasks;
  }

  private async analyzeBatch(
    nodes: NodeProperties[]
  ): Promise<DiscoveredRelationship[]> {
    const relationships: DiscoveredRelationship[] = [];

    for (const node of nodes) {
      if (!this.running) break;

      // 检查缓存
      const cacheKey = `relationships:${node.id}`;
      if (this.config.cacheResults) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          relationships.push(...cached);
          continue;
        }
      }

      // 分析节点关系
      const discovered = await this.analyzeNode(node);
      relationships.push(...discovered);

      // 更新缓存
      if (this.config.cacheResults) {
        await this.cache.set(
          cacheKey,
          discovered,
          this.config.cacheExpiration
        );
      }
    }

    return relationships;
  }

  private async analyzeNode(
    node: NodeProperties
  ): Promise<DiscoveredRelationship[]> {
    const relationships: DiscoveredRelationship[] = [];

    // 获取适用的规则
    const rules = this.ruleEngine.getApplicableRules(node);

    // 应用每个规则
    for (const rule of rules) {
      if (!this.running) break;

      try {
        const result = await this.ruleEngine.applyRule(rule, node);
        if (result.length > 0) {
          relationships.push(...result);
        }
      } catch (error) {
        console.error(`Failed to apply rule ${rule.id}:`, error);
      }
    }

    return relationships;
  }

  private async executeTasks(
    tasks: Array<() => Promise<DiscoveredRelationship[]>>,
    stats: DiscoveryResult['stats']
  ): Promise<DiscoveredRelationship[]> {
    const relationships: DiscoveredRelationship[] = [];
    const activeTasks = new Set<Promise<void>>();

    for (const task of tasks) {
      if (!this.running) break;

      // 等待有空闲槽位
      while (activeTasks.size >= this.config.maxConcurrentTasks) {
        await Promise.race(Array.from(activeTasks));
      }

      // 创建新任务
      const taskPromise = (async () => {
        try {
          const result = await this.executeTaskWithTimeout(task);
          relationships.push(...result);
          this.updateStats(stats, result);
        } finally {
          activeTasks.delete(taskPromise);
        }
      })();

      activeTasks.add(taskPromise);
    }

    // 等待所有任务完成
    await Promise.all(Array.from(activeTasks));

    return relationships;
  }

  private async executeTaskWithTimeout<T>(
    task: () => Promise<T>
  ): Promise<T> {
    return Promise.race([
      task(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error('Task timeout')),
          this.config.taskTimeout
        )
      )
    ]);
  }

  private filterRelationships(
    relationships: DiscoveredRelationship[]
  ): DiscoveredRelationship[] {
    // 按置信度过滤
    let filtered = relationships.filter(r =>
      r.confidence >= this.config.minConfidence
    );

    // 按最大关系数限制
    if (filtered.length > this.config.maxRelationships) {
      filtered.sort((a, b) => b.confidence - a.confidence);
      filtered = filtered.slice(0, this.config.maxRelationships);
    }

    return filtered;
  }

  private async persistRelationships(
    relationships: DiscoveredRelationship[]
  ): Promise<void> {
    const edges: EdgeProperties[] = relationships.map(r => r.edge);
    await this.storage.createEdges(edges);
  }

  private updateStats(
    stats: DiscoveryResult['stats'],
    relationships: DiscoveredRelationship[]
  ): void {
    for (const rel of relationships) {
      const ruleStats = stats.ruleStats.get(rel.rule.type);
      if (ruleStats) {
        ruleStats.triggered++;
        ruleStats.succeeded++;
        ruleStats.avgConfidence = (
          ruleStats.avgConfidence * (ruleStats.succeeded - 1) +
          rel.confidence
        ) / ruleStats.succeeded;
      }
    }
  }
} 