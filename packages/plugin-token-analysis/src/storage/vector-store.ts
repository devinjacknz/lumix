import { VectorStore } from "langchain/vectorstores";
import { Document } from "langchain/document";
import { Embeddings } from "langchain/embeddings";
import { logger } from "@lumix/core";

export interface VectorStoreConfig {
  embeddings: Embeddings;
  collection: string;
  dimension: number;
  similarityMetric?: "cosine" | "euclidean" | "dot_product";
  indexParams?: {
    M?: number;
    efConstruction?: number;
    efSearch?: number;
  };
  cacheConfig?: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
}

export interface SearchResult {
  document: Document;
  score: number;
  metadata?: Record<string, any>;
}

export class LumixVectorStore extends VectorStore {
  private config: VectorStoreConfig;
  private collection: string;
  private cache: Map<string, {
    results: SearchResult[];
    timestamp: number;
  }>;

  constructor(embeddings: Embeddings, config: Partial<VectorStoreConfig> = {}) {
    super(embeddings, {});
    this.config = {
      embeddings,
      collection: "default",
      dimension: 1536, // OpenAI 默认维度
      similarityMetric: "cosine",
      indexParams: {
        M: 16,
        efConstruction: 200,
        efSearch: 50
      },
      cacheConfig: {
        enabled: true,
        ttl: 3600000, // 1小时
        maxSize: 1000
      },
      ...config
    };
    this.collection = this.config.collection;
    this.cache = new Map();
  }

  async addDocuments(documents: Document[]): Promise<void> {
    try {
      // 生成文档嵌入
      const vectors = await this.embeddings.embedDocuments(
        documents.map(doc => doc.pageContent)
      );

      // 添加到向量存储
      await this.addVectors(vectors, documents);

      // 清除相关缓存
      this.clearRelatedCache(documents);

      logger.info(
        "Vector Store",
        `Added ${documents.length} documents to collection ${this.collection}`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Vector Store",
          `Failed to add documents: ${error.message}`
        );
      }
      throw error;
    }
  }

  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    try {
      // 验证向量维度
      this.validateVectors(vectors);

      // TODO: 实现向量存储逻辑
      
      logger.info(
        "Vector Store",
        `Added ${vectors.length} vectors to collection ${this.collection}`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Vector Store",
          `Failed to add vectors: ${error.message}`
        );
      }
      throw error;
    }
  }

  async similaritySearch(
    query: string,
    k: number = 4,
    filter?: Record<string, any>
  ): Promise<SearchResult[]> {
    try {
      // 检查缓存
      const cacheKey = this.getCacheKey(query, k, filter);
      const cached = this.checkCache(cacheKey);
      if (cached) {
        return cached;
      }

      // 生成查询向量
      const queryVector = await this.embeddings.embedQuery(query);

      // 执行相似度搜索
      const results = await this.similaritySearchVectorWithScore(
        queryVector,
        k,
        filter
      );

      // 缓存结果
      this.cacheResults(cacheKey, results);

      return results;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Vector Store",
          `Similarity search failed: ${error.message}`
        );
      }
      throw error;
    }
  }

  async similaritySearchVectorWithScore(
    vector: number[],
    k: number = 4,
    filter?: Record<string, any>
  ): Promise<SearchResult[]> {
    try {
      // 验证查询向量
      this.validateVector(vector);

      // TODO: 实现向量搜索逻辑

      return [];
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Vector Store",
          `Vector similarity search failed: ${error.message}`
        );
      }
      throw error;
    }
  }

  async delete(ids: string[]): Promise<void> {
    try {
      // TODO: 实现删除逻辑

      // 清除相关缓存
      this.clearCache();

      logger.info(
        "Vector Store",
        `Deleted ${ids.length} documents from collection ${this.collection}`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Vector Store",
          `Failed to delete documents: ${error.message}`
        );
      }
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      // TODO: 实现清空集合逻辑

      // 清除所有缓存
      this.clearCache();

      logger.info(
        "Vector Store",
        `Cleared collection ${this.collection}`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Vector Store",
          `Failed to clear collection: ${error.message}`
        );
      }
      throw error;
    }
  }

  private validateVectors(vectors: number[][]): void {
    for (const vector of vectors) {
      this.validateVector(vector);
    }
  }

  private validateVector(vector: number[]): void {
    if (vector.length !== this.config.dimension) {
      throw new Error(
        `Vector dimension mismatch. Expected ${this.config.dimension}, got ${vector.length}`
      );
    }
  }

  private getCacheKey(
    query: string,
    k: number,
    filter?: Record<string, any>
  ): string {
    return `${this.collection}:${query}:${k}:${JSON.stringify(filter)}`;
  }

  private checkCache(key: string): SearchResult[] | null {
    if (!this.config.cacheConfig.enabled) {
      return null;
    }

    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.timestamp > this.config.cacheConfig.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.results;
  }

  private cacheResults(key: string, results: SearchResult[]): void {
    if (!this.config.cacheConfig.enabled) {
      return;
    }

    // 检查缓存大小
    if (this.cache.size >= this.config.cacheConfig.maxSize) {
      // 删除最旧的缓存
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      results,
      timestamp: Date.now()
    });
  }

  private clearRelatedCache(documents: Document[]): void {
    if (!this.config.cacheConfig.enabled) {
      return;
    }

    // 清除包含相关文档内容的缓存
    const contentSet = new Set(documents.map(doc => doc.pageContent));
    
    for (const [key, value] of this.cache.entries()) {
      const hasRelatedContent = value.results.some(result =>
        contentSet.has(result.document.pageContent)
      );
      if (hasRelatedContent) {
        this.cache.delete(key);
      }
    }
  }

  private clearCache(): void {
    this.cache.clear();
  }

  static async fromTexts(
    texts: string[],
    metadatas: Record<string, any>[],
    embeddings: Embeddings,
    config?: Partial<VectorStoreConfig>
  ): Promise<LumixVectorStore> {
    const docs = texts.map(
      (text, i) => new Document({ pageContent: text, metadata: metadatas[i] })
    );
    
    const store = new LumixVectorStore(embeddings, config);
    await store.addDocuments(docs);
    
    return store;
  }

  static async fromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    config?: Partial<VectorStoreConfig>
  ): Promise<LumixVectorStore> {
    const store = new LumixVectorStore(embeddings, config);
    await store.addDocuments(docs);
    return store;
  }
} 