import {
  KnowledgeItem,
  CreateKnowledgeItem,
  KnowledgeRetrievalOptions,
  KnowledgeRetrievalResult,
  KnowledgeManagerConfig,
  Vector
} from '../types';

/**
 * 知识管理器操作结果
 */
export interface KnowledgeOperationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * 知识管理器统计信息
 */
export interface KnowledgeStats {
  totalItems: number;
  totalChunks: number;
  averageChunksPerItem: number;
  memoryUsage: number;
  embeddingModel: string;
}

/**
 * 知识管理器接口
 */
export abstract class KnowledgeManager {
  protected config: KnowledgeManagerConfig;

  constructor(config: KnowledgeManagerConfig) {
    this.config = config;
  }

  /**
   * 初始化知识管理器
   */
  abstract init(): Promise<KnowledgeOperationResult<void>>;

  /**
   * 关闭知识管理器
   */
  abstract close(): Promise<KnowledgeOperationResult<void>>;

  /**
   * 添加知识项
   */
  abstract add(item: CreateKnowledgeItem): Promise<KnowledgeOperationResult<KnowledgeItem>>;

  /**
   * 获取知识项
   */
  abstract get(id: string): Promise<KnowledgeOperationResult<KnowledgeItem | null>>;

  /**
   * 更新知识项
   */
  abstract update(id: string, item: Partial<CreateKnowledgeItem>): Promise<KnowledgeOperationResult<KnowledgeItem>>;

  /**
   * 删除知识项
   */
  abstract delete(id: string): Promise<KnowledgeOperationResult<boolean>>;

  /**
   * 批量操作
   */
  abstract batch(operations: Array<{
    type: 'add' | 'update' | 'delete';
    item: CreateKnowledgeItem | Partial<CreateKnowledgeItem>;
    id?: string;
  }>): Promise<KnowledgeOperationResult<KnowledgeItem[]>>;

  /**
   * 相似度检索
   */
  abstract retrieve(query: string | Vector, options?: KnowledgeRetrievalOptions): Promise<KnowledgeOperationResult<KnowledgeRetrievalResult[]>>;

  /**
   * 获取统计信息
   */
  abstract stats(): Promise<KnowledgeOperationResult<KnowledgeStats>>;

  /**
   * 清空所有数据
   */
  abstract clear(): Promise<KnowledgeOperationResult<void>>;

  /**
   * 重建索引
   */
  abstract rebuildIndex(): Promise<KnowledgeOperationResult<void>>;

  /**
   * 生成文本嵌入
   */
  abstract generateEmbedding(text: string): Promise<KnowledgeOperationResult<Vector>>;

  /**
   * 文本分块
   */
  abstract chunk(text: string, options?: {
    size?: number;
    overlap?: number;
  }): Promise<KnowledgeOperationResult<string[]>>;

  /**
   * 重新排序检索结果
   */
  abstract rerank(results: KnowledgeRetrievalResult[], query: string): Promise<KnowledgeOperationResult<KnowledgeRetrievalResult[]>>;

  /**
   * 获取所有知识项
   */
  abstract list(options?: {
    offset?: number;
    limit?: number;
    type?: string;
    source?: string;
  }): Promise<KnowledgeOperationResult<KnowledgeItem[]>>;

  /**
   * 导出知识库
   */
  abstract export(path: string): Promise<KnowledgeOperationResult<void>>;

  /**
   * 导入知识库
   */
  abstract import(path: string): Promise<KnowledgeOperationResult<void>>;
}
