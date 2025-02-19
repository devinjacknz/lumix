import { BaseError, RAGError } from '../types/errors';
import { KnowledgeResult, ModelConfig } from '../types/base';
import { BaseRAGKnowledgeManager } from './base';

export interface RAGConfig {
  chunkSize?: number;
  chunkOverlap?: number;
  embedModel?: string;
  retrievalTopK?: number;
  similarityThreshold?: number;
}

export interface RAGGenerationOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface RAGGenerationResult {
  answer: string;
  sources: KnowledgeRetrievalResult[];
  metadata: {
    totalTokens: number;
    generationTime: number;
  };
}

export interface KnowledgeItem {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
}

export interface KnowledgeRetrievalResult {
  item: KnowledgeItem;
  score: number;
}

export abstract class RAGKnowledgeManager extends BaseRAGKnowledgeManager {
  protected ragConfig: RAGConfig;

  constructor(config: ModelConfig & { rag: RAGConfig }) {
    super();
    this.ragConfig = config.rag;
    this.validateConfig();
  }

  /**
   * 生成回答
   */
  abstract generate(
    query: string,
    options?: RAGGenerationOptions
  ): Promise<KnowledgeResult<RAGGenerationResult>>;

  /**
   * 预处理文档
   */
  abstract preprocess(
    items: KnowledgeItem[],
    options?: {
      chunkSize?: number;
      chunkOverlap?: number;
      embedModel?: string;
    }
  ): Promise<KnowledgeResult<KnowledgeItem[]>>;

  /**
   * 评估生成质量
   */
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

  /**
   * 流式生成回答
   */
  abstract generateStream(
    query: string,
    options?: RAGGenerationOptions & {
      onToken?: (token: string) => void;
      onSources?: (sources: KnowledgeRetrievalResult[]) => void;
    }
  ): Promise<KnowledgeResult<void>>;

  /**
   * 更新RAG配置
   */
  abstract updateRAGConfig(config: Partial<RAGConfig>): Promise<KnowledgeResult<void>>;

  /**
   * 获取RAG统计信息
   */
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

  protected validateConfig(): void {
    if (!this.ragConfig) {
      throw new RAGError('RAG configuration is required');
    }

    const { chunkSize, chunkOverlap, retrievalTopK, similarityThreshold } = this.ragConfig;

    if (chunkSize && chunkSize <= 0) {
      throw new RAGError('Chunk size must be positive');
    }

    if (chunkOverlap && (chunkOverlap < 0 || chunkOverlap >= (chunkSize || Infinity))) {
      throw new RAGError('Invalid chunk overlap');
    }

    if (retrievalTopK && retrievalTopK <= 0) {
      throw new RAGError('Retrieval top K must be positive');
    }

    if (similarityThreshold && (similarityThreshold < 0 || similarityThreshold > 1)) {
      throw new RAGError('Similarity threshold must be between 0 and 1');
    }
  }
}
