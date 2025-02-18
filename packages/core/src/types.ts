export type Vector = number[];

/**
 * 知识管理器配置
 */
export interface KnowledgeManagerConfig {
  embeddingModel: string;
  maxTokens?: number;
  temperature?: number;
  apiKey?: string;
  apiEndpoint?: string;
}

/**
 * RAG配置
 */
export interface RAGConfig {
  retrievalModel: string;
  chunkSize: number;
  chunkOverlap: number;
  maxSourceDocuments: number;
  similarityThreshold: number;
  embeddingDimension: number;
  indexType: 'faiss' | 'annoy' | 'hnsw';
  indexParams?: Record<string, unknown>;
}

/**
 * 知识项创建参数
 */
export interface CreateKnowledgeItem {
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: Vector;
}

/**
 * 知识项
 */
export interface KnowledgeItem extends CreateKnowledgeItem {
  id: string;
  timestamp: number;
}

/**
 * 知识检索选项
 */
export interface KnowledgeRetrievalOptions {
  limit?: number;
  threshold?: number;
  filters?: Record<string, unknown>;
}

/**
 * 知识检索结果
 */
export interface KnowledgeRetrievalResult {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 知识操作结果
 */
export interface KnowledgeResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
