import { VectorStore } from '@langchain/core/vectorstores';
import { Embeddings } from '@langchain/core/embeddings';
import { Document } from '@langchain/core/documents';

/**
 * 向量存储配置
 */
export interface VectorStoreConfig {
  embeddings: Embeddings;
  dimension?: number;
  similarityMetric?: 'cosine' | 'euclidean' | 'dot_product';
  namespace?: string;
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * 搜索参数
 */
export interface SearchParams {
  k?: number;
  minSimilarity?: number;
  filter?: Record<string, any>;
  namespace?: string;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  document: Document;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * LangChain 风格的基础向量存储
 */
export abstract class BaseVectorStore extends VectorStore {
  protected config: Required<VectorStoreConfig>;
  protected embeddings: Embeddings;

  constructor(embeddings: Embeddings, dbConfig: Record<string, any>) {
    super(embeddings, dbConfig);
    
    if (!embeddings) {
      throw new Error('Embeddings are required for vector store');
    }

    this.embeddings = embeddings;
    this.config = {
      embeddings: embeddings,
      dimension: dbConfig.dimension || 1536, // OpenAI 默认维度
      similarityMetric: dbConfig.similarityMetric || 'cosine',
      namespace: dbConfig.namespace || 'default',
      batchSize: dbConfig.batchSize || 100,
      maxRetries: dbConfig.maxRetries || 3,
      retryDelay: dbConfig.retryDelay || 1000
    };
  }

  /**
   * 添加文档
   */
  async addDocuments(
    documents: Document[],
    options?: { embeddings?: number[][]; namespace?: string }
  ): Promise<void> {
    // 分批处理
    for (let i = 0; i < documents.length; i += this.config.batchSize) {
      const batch = documents.slice(i, i + this.config.batchSize);
      
      // 获取嵌入向量
      const embeddings = options?.embeddings?.slice(i, i + this.config.batchSize) ||
        await this.embeddings.embedDocuments(
          batch.map(doc => doc.pageContent)
        );

      // 添加到存储
      await this.addVectors(
        embeddings,
        batch,
        options?.namespace || this.config.namespace
      );
    }
  }

  /**
   * 相似度搜索
   */
  async similaritySearch(
    query: string,
    k = 4,
    filter?: Record<string, any>
  ): Promise<Document[]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);
    const results = await this.similaritySearchVectorWithScore(queryEmbedding, k, filter);
    return results.map(([doc]) => doc);
  }

  /**
   * 删除文档
   */
  async delete(params: { ids?: string[]; filter?: Record<string, any>; namespace?: string }): Promise<void> {
    await this.deleteVectors(params);
  }

  /**
   * 添加向量
   */
  protected abstract addVectors(
    vectors: number[][],
    documents: Document[],
    options?: Record<string, any>
  ): Promise<void | string[]>;

  /**
   * 向量相似度搜索
   */
  protected abstract similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: Record<string, any>
  ): Promise<[Document, number][]>;

  /**
   * 删除向量
   */
  protected abstract deleteVectors(params: {
    ids?: string[];
    filter?: Record<string, any>;
    namespace?: string;
  }): Promise<void>;

  /**
   * 计算相似度
   */
  protected calculateSimilarity(v1: number[], v2: number[]): number {
    switch (this.config.similarityMetric) {
      case 'cosine':
        return this.cosineSimilarity(v1, v2);
      case 'euclidean':
        return this.euclideanSimilarity(v1, v2);
      case 'dot_product':
        return this.dotProduct(v1, v2);
      default:
        throw new Error(`Unknown similarity metric: ${this.config.similarityMetric}`);
    }
  }

  /**
   * 余弦相似度
   */
  private cosineSimilarity(v1: number[], v2: number[]): number {
    const dot = this.dotProduct(v1, v2);
    const norm1 = Math.sqrt(this.dotProduct(v1, v1));
    const norm2 = Math.sqrt(this.dotProduct(v2, v2));
    return dot / (norm1 * norm2);
  }

  /**
   * 欧几里得相似度
   */
  private euclideanSimilarity(v1: number[], v2: number[]): number {
    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
      sum += Math.pow(v1[i] - v2[i], 2);
    }
    return 1 / (1 + Math.sqrt(sum));
  }

  /**
   * 点积
   */
  private dotProduct(v1: number[], v2: number[]): number {
    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
      sum += v1[i] * v2[i];
    }
    return sum;
  }
} 