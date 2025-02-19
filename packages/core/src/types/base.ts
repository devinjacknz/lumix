import { z } from 'zod';
import { 
  BaseConfig,
  BaseResult,
  BaseManager
} from '@lumix/types';

export {
  BaseConfig,
  BaseResult,
  BaseManager
};

// Re-export types from @lumix/types
export type {
  KnowledgeItem,
  KnowledgeResult,
  KnowledgeRetrievalResult,
  KnowledgeRetrievalOptions,
  KnowledgeManagerConfig
} from '@lumix/types';

/**
 * 模型配置接口
 */
export interface ModelConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

/**
 * 知识项目基础接口
 */
export interface KnowledgeItem {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  timestamp?: Date;
}

/**
 * 知识检索结果
 */
export interface KnowledgeRetrievalResult {
  item: KnowledgeItem;
  score: number;
  distance?: number;
}

/**
 * 知识管理器配置
 */
export interface KnowledgeManagerConfig {
  namespace?: string;
  maxItems?: number;
  embedModel?: string;
  similarityThreshold?: number;
}

/**
 * 知识管理结果
 */
export interface KnowledgeResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  metadata?: {
    timestamp: Date;
    duration: number;
  };
}

/**
 * 知识检索选项
 */
export interface KnowledgeRetrievalOptions {
  limit?: number;
  minScore?: number;
  filter?: Record<string, any>;
  includeMetadata?: boolean;
}

/**
 * 知识管理器基类
 */
export abstract class KnowledgeManager {
  protected config: KnowledgeManagerConfig;

  constructor(config: KnowledgeManagerConfig) {
    this.config = {
      namespace: 'default',
      maxItems: 1000,
      similarityThreshold: 0.8,
      ...config
    };
  }

  /**
   * 添加知识项
   */
  abstract addItem(
    item: KnowledgeItem
  ): Promise<KnowledgeResult<KnowledgeItem>>;

  /**
   * 检索知识
   */
  abstract retrieve(
    query: string,
    options?: KnowledgeRetrievalOptions
  ): Promise<KnowledgeResult<KnowledgeRetrievalResult[]>>;

  /**
   * 删除知识项
   */
  abstract removeItem(id: string): Promise<KnowledgeResult<void>>;

  /**
   * 清空知识库
   */
  abstract clear(): Promise<KnowledgeResult<void>>;

  /**
   * 获取知识库统计信息
   */
  abstract stats(): Promise<KnowledgeResult<{
    totalItems: number;
    lastUpdated: Date;
    memoryUsage: number;
  }>>;
}

// Zod Schemas
export const KnowledgeItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
  embedding: z.array(z.number()).optional(),
  timestamp: z.date().optional()
});

export const KnowledgeRetrievalResultSchema = z.object({
  item: KnowledgeItemSchema,
  score: z.number(),
  distance: z.number().optional()
});

export const KnowledgeManagerConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  namespace: z.string().optional(),
  maxItems: z.number().optional(),
  embedModel: z.string().optional(),
  similarityThreshold: z.number().optional(),
  storageType: z.enum(['memory', 'file', 'database']),
  storagePath: z.string().optional()
});

export const KnowledgeResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.instanceof(Error).optional(),
  metadata: z.object({
    timestamp: z.date(),
    duration: z.number()
  }).optional()
});

export const KnowledgeRetrievalOptionsSchema = z.object({
  limit: z.number().optional(),
  minScore: z.number().optional(),
  filter: z.record(z.any()).optional(),
  includeMetadata: z.boolean().optional()
});

export const ModelConfigSchema = z.object({
  model: z.string(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  topP: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  presencePenalty: z.number().optional(),
  stop: z.array(z.string()).optional()
});
