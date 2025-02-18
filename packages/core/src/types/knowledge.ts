import { BaseResult, BaseManager } from '@lumix/types';

/**
 * 知识管理结果类型
 */
export interface KnowledgeResult<T = any> extends BaseResult {
  data?: T;
}

/**
 * 知识项类型
 */
export interface KnowledgeItem {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  timestamp?: Date;
}

/**
 * 知识检索结果类型
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
 * RAG配置
 */
export interface RAGConfig {
  llm?: any; // Language model instance
  temperature?: number;
  maxTokens?: number;
  topK?: number;
  minRelevanceScore?: number;
  promptTemplate?: string;
  stopSequences?: string[];
}

/**
 * RAG生成选项
 */
export interface RAGGenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topK?: number;
  minRelevanceScore?: number;
  promptTemplate?: string;
  metadata?: Record<string, any>;
  stop?: string[];
}

/**
 * RAG生成结果
 */
export interface RAGGenerationResult {
  text: string;
  answer: string;
  sources: KnowledgeRetrievalResult[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}

/**
 * 知识管理器抽象类
 */
export abstract class KnowledgeManager implements BaseManager {
  protected config: KnowledgeManagerConfig;

  constructor(config: KnowledgeManagerConfig) {
    this.config = {
      namespace: 'default',
      maxItems: 1000,
      similarityThreshold: 0.8,
      ...config
    };
  }

  abstract initialize(): Promise<void>;
  abstract destroy(): Promise<void>;
  abstract addItem(item: KnowledgeItem): Promise<KnowledgeResult<KnowledgeItem>>;
  abstract retrieve(query: string, options?: KnowledgeRetrievalOptions): Promise<KnowledgeResult<KnowledgeRetrievalResult[]>>;
  abstract removeItem(id: string): Promise<KnowledgeResult<void>>;
  abstract clear(): Promise<KnowledgeResult<void>>;
  abstract stats(): Promise<KnowledgeResult<{
    totalItems: number;
    lastUpdated: Date;
    memoryUsage: number;
  }>>;
}

/**
 * RAG知识管理器抽象类
 */
export abstract class RAGKnowledgeManager extends KnowledgeManager {
  protected ragConfig: RAGConfig;

  constructor(config: KnowledgeManagerConfig & { rag: RAGConfig }) {
    super(config);
    this.ragConfig = {
      temperature: 0.7,
      maxTokens: 2048,
      topK: 3,
      minRelevanceScore: 0.7,
      ...config.rag
    };
  }

  abstract generate(
    query: string,
    options?: RAGGenerationOptions
  ): Promise<KnowledgeResult<RAGGenerationResult>>;

  abstract generateStream(
    query: string,
    options?: RAGGenerationOptions & {
      onToken?: (token: string) => void;
      onSources?: (sources: KnowledgeRetrievalResult[]) => void;
    }
  ): Promise<KnowledgeResult<void>>;

  abstract preprocess(
    items: KnowledgeItem[],
    options?: {
      chunkSize?: number;
      chunkOverlap?: number;
      embedModel?: string;
    }
  ): Promise<KnowledgeResult<KnowledgeItem[]>>;

  abstract evaluate(
    queries: string[],
    options?: {
      groundTruth?: string[];
      metrics?: Array<'relevance' | 'faithfulness' | 'coherence'>;
    }
  ): Promise<KnowledgeResult<{
    scores: Record<string, number>;
    details: Array<{
      query: string;
      answer: string;
      groundTruth?: string;
      sources: KnowledgeRetrievalResult[];
      metrics: Record<string, number>;
    }>;
  }>>;

  abstract updateRAGConfig(config: Partial<RAGConfig>): Promise<KnowledgeResult<void>>;

  abstract ragStats(): Promise<KnowledgeResult<{
    totalQueries: number;
    averageLatency: number;
    tokenUsage: {
      prompt: number;
      completion: number;
      total: number;
    };
    sourceDistribution: Record<string, number>;
  }>>;
}

export interface KnowledgeRetrievalOptions {
  limit?: number;
  minScore?: number;
  filter?: Record<string, any>;
  includeMetadata?: boolean;
}

export interface IKnowledgeManager extends BaseManager {
  addItem(item: KnowledgeItem): Promise<KnowledgeResult<KnowledgeItem>>;
  retrieve(query: string, options?: KnowledgeRetrievalOptions): Promise<KnowledgeResult<KnowledgeRetrievalResult[]>>;
  removeItem(id: string): Promise<KnowledgeResult<void>>;
  clear(): Promise<KnowledgeResult<void>>;
  stats(): Promise<KnowledgeResult<{
    totalItems: number;
    lastUpdated: Date;
    memoryUsage: number;
  }>>;
}
