import { ChainProtocol } from '../chain/abstract';
import { MarketMetrics, MarketSignal } from './market-analyzer';
import { StrategyConfig, StrategyPerformance } from './strategy-optimizer';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, any>;
  metadata: {
    createdAt: number;
    updatedAt: number;
    confidence: number;
  };
}

export type EntityType =
  | 'token'
  | 'protocol'
  | 'pool'
  | 'strategy'
  | 'event'
  | 'pattern'
  | 'risk';

export interface Relationship {
  id: string;
  type: RelationType;
  source: string;
  target: string;
  properties: Record<string, any>;
  metadata: {
    createdAt: number;
    updatedAt: number;
    strength: number;
    confidence: number;
  };
}

export type RelationType =
  | 'correlates_with'
  | 'depends_on'
  | 'affects'
  | 'part_of'
  | 'leads_to'
  | 'similar_to';

export interface GraphQuery {
  entities?: {
    types?: EntityType[];
    properties?: Record<string, any>;
  };
  relationships?: {
    types?: RelationType[];
    properties?: Record<string, any>;
  };
  depth?: number;
}

export interface GraphPattern {
  entities: Entity[];
  relationships: Relationship[];
  confidence: number;
  frequency: number;
}

export class KnowledgeGraph {
  private entities: Map<string, Entity> = new Map();
  private relationships: Map<string, Relationship> = new Map();
  private patterns: Map<string, GraphPattern> = new Map();

  constructor() {
    this.initializeGraph();
  }

  private initializeGraph() {
    // 初始化基础知识结构
  }

  async addEntity(entity: Entity): Promise<void> {
    // 验证实体
    this.validateEntity(entity);

    // 更新时间戳
    entity.metadata.updatedAt = Date.now();

    // 存储实体
    this.entities.set(entity.id, entity);

    // 分析并建立可能的关系
    await this.analyzeEntityRelationships(entity);
  }

  async addRelationship(relationship: Relationship): Promise<void> {
    // 验证关系
    this.validateRelationship(relationship);

    // 更新时间戳
    relationship.metadata.updatedAt = Date.now();

    // 存储关系
    this.relationships.set(relationship.id, relationship);

    // 更新模式识别
    await this.updatePatterns(relationship);
  }

  private validateEntity(entity: Entity): void {
    if (!entity.id || !entity.type || !entity.name) {
      throw new Error('Invalid entity: missing required fields');
    }

    if (!entity.metadata) {
      entity.metadata = {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        confidence: 1.0,
      };
    }
  }

  private validateRelationship(relationship: Relationship): void {
    if (
      !relationship.id ||
      !relationship.type ||
      !relationship.source ||
      !relationship.target
    ) {
      throw new Error('Invalid relationship: missing required fields');
    }

    if (!this.entities.has(relationship.source)) {
      throw new Error('Source entity not found');
    }

    if (!this.entities.has(relationship.target)) {
      throw new Error('Target entity not found');
    }

    if (!relationship.metadata) {
      relationship.metadata = {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        strength: 1.0,
        confidence: 1.0,
      };
    }
  }

  private async analyzeEntityRelationships(entity: Entity): Promise<void> {
    // 分析实体与现有实体的潜在关系
    const existingEntities = Array.from(this.entities.values());

    for (const existing of existingEntities) {
      if (existing.id === entity.id) continue;

      const relationships = await this.inferRelationships(entity, existing);
      for (const relationship of relationships) {
        await this.addRelationship(relationship);
      }
    }
  }

  private async inferRelationships(
    entity1: Entity,
    entity2: Entity
  ): Promise<Relationship[]> {
    const relationships: Relationship[] = [];

    // 基于实体类型和属性推断关系
    if (entity1.type === 'token' && entity2.type === 'token') {
      // 分析代币相关性
      const correlation = await this.analyzeTokenCorrelation(entity1, entity2);
      if (correlation > 0.5) {
        relationships.push({
          id: `${entity1.id}-correlates-${entity2.id}`,
          type: 'correlates_with',
          source: entity1.id,
          target: entity2.id,
          properties: {
            correlation,
          },
          metadata: {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            strength: correlation,
            confidence: 0.8,
          },
        });
      }
    }

    if (entity1.type === 'protocol' && entity2.type === 'token') {
      // 分析协议与代币的依赖关系
      const dependency = await this.analyzeProtocolDependency(entity1, entity2);
      if (dependency > 0.3) {
        relationships.push({
          id: `${entity1.id}-depends-${entity2.id}`,
          type: 'depends_on',
          source: entity1.id,
          target: entity2.id,
          properties: {
            dependency,
          },
          metadata: {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            strength: dependency,
            confidence: 0.9,
          },
        });
      }
    }

    return relationships;
  }

  private async analyzeTokenCorrelation(
    token1: Entity,
    token2: Entity
  ): Promise<number> {
    // 实现代币相关性分析
    return 0.5;
  }

  private async analyzeProtocolDependency(
    protocol: Entity,
    token: Entity
  ): Promise<number> {
    // 实现协议依赖性分析
    return 0.3;
  }

  private async updatePatterns(relationship: Relationship): Promise<void> {
    // 更新图谱模式
    const connectedEntities = this.findConnectedEntities(relationship);
    const pattern = this.extractPattern(connectedEntities, relationship);

    if (pattern) {
      const patternId = this.generatePatternId(pattern);
      const existingPattern = this.patterns.get(patternId);

      if (existingPattern) {
        existingPattern.frequency += 1;
        existingPattern.confidence = Math.min(
          1,
          existingPattern.confidence + 0.1
        );
        this.patterns.set(patternId, existingPattern);
      } else {
        pattern.frequency = 1;
        this.patterns.set(patternId, pattern);
      }
    }
  }

  private findConnectedEntities(relationship: Relationship): Entity[] {
    const entities: Entity[] = [];
    const source = this.entities.get(relationship.source);
    const target = this.entities.get(relationship.target);

    if (source) entities.push(source);
    if (target) entities.push(target);

    return entities;
  }

  private extractPattern(
    entities: Entity[],
    relationship: Relationship
  ): GraphPattern | null {
    // 实现模式提取逻辑
    return {
      entities,
      relationships: [relationship],
      confidence: 0.7,
      frequency: 1,
    };
  }

  private generatePatternId(pattern: GraphPattern): string {
    // 生成模式唯一标识
    return `pattern-${Date.now()}`;
  }

  async query(query: GraphQuery): Promise<{
    entities: Entity[];
    relationships: Relationship[];
  }> {
    const result = {
      entities: [] as Entity[],
      relationships: [] as Relationship[],
    };

    // 根据查询条件筛选实体
    if (query.entities) {
      result.entities = Array.from(this.entities.values()).filter(entity => {
        if (
          query.entities?.types &&
          !query.entities.types.includes(entity.type)
        ) {
          return false;
        }

        if (query.entities?.properties) {
          return this.matchProperties(entity.properties, query.entities.properties);
        }

        return true;
      });
    }

    // 根据查询条件筛选关系
    if (query.relationships) {
      result.relationships = Array.from(this.relationships.values()).filter(
        relationship => {
          if (
            query.relationships?.types &&
            !query.relationships.types.includes(relationship.type)
          ) {
            return false;
          }

          if (query.relationships?.properties) {
            return this.matchProperties(
              relationship.properties,
              query.relationships.properties
            );
          }

          return true;
        }
      );
    }

    return result;
  }

  private matchProperties(
    actual: Record<string, any>,
    query: Record<string, any>
  ): boolean {
    return Object.entries(query).every(([key, value]) => actual[key] === value);
  }

  async findPatterns(
    minConfidence: number = 0.7,
    minFrequency: number = 2
  ): Promise<GraphPattern[]> {
    return Array.from(this.patterns.values()).filter(
      pattern =>
        pattern.confidence >= minConfidence &&
        pattern.frequency >= minFrequency
    );
  }

  async addMarketData(
    asset: string,
    chain: ChainProtocol,
    metrics: MarketMetrics,
    signals: MarketSignal[]
  ): Promise<void> {
    // 添加市场数据到知识图谱
    const assetEntity: Entity = {
      id: `token-${chain}-${asset}`,
      type: 'token',
      name: asset,
      properties: {
        chain,
        price: metrics.price,
        volume: metrics.volume24h,
        liquidity: metrics.liquidity,
      },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        confidence: 1.0,
      },
    };

    await this.addEntity(assetEntity);

    // 添加市场信号
    for (const signal of signals) {
      const signalEntity: Entity = {
        id: `signal-${Date.now()}-${signal.type}`,
        type: 'event',
        name: signal.type,
        properties: {
          asset,
          price: signal.price,
          confidence: signal.confidence,
          reason: signal.reason,
        },
        metadata: {
          createdAt: signal.timestamp,
          updatedAt: signal.timestamp,
          confidence: signal.confidence,
        },
      };

      await this.addEntity(signalEntity);

      // 建立信号与资产的关系
      await this.addRelationship({
        id: `${signalEntity.id}-affects-${assetEntity.id}`,
        type: 'affects',
        source: signalEntity.id,
        target: assetEntity.id,
        properties: {
          impact: signal.confidence,
        },
        metadata: {
          createdAt: signal.timestamp,
          updatedAt: signal.timestamp,
          strength: signal.confidence,
          confidence: signal.confidence,
        },
      });
    }
  }

  async addStrategyResult(
    strategy: StrategyConfig,
    performance: StrategyPerformance
  ): Promise<void> {
    // 添加策略结果到知识图谱
    const strategyEntity: Entity = {
      id: `strategy-${strategy.name}`,
      type: 'strategy',
      name: strategy.name,
      properties: {
        type: strategy.type,
        parameters: strategy.parameters,
        performance: {
          returns: performance.returns,
          sharpeRatio: performance.sharpeRatio,
          winRate: performance.winRate,
        },
      },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        confidence: 0.9,
      },
    };

    await this.addEntity(strategyEntity);
  }

  getEntityCount(): number {
    return this.entities.size;
  }

  getRelationshipCount(): number {
    return this.relationships.size;
  }

  getPatternCount(): number {
    return this.patterns.size;
  }
} 