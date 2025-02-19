import { z } from 'zod';

/**
 * 向量类型
 */
export type Vector = number[];

/**
 * 向量距离计算方法
 */
export enum DistanceMetric {
  COSINE = 'cosine',
  EUCLIDEAN = 'euclidean',
  MANHATTAN = 'manhattan',
  DOT_PRODUCT = 'dot_product'
}

/**
 * 内存条目模式验证
 */
export const MemoryEntrySchema = z.object({
  id: z.string(),
  content: z.string(),
  embedding: z.array(z.number()),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * 内存条目类型
 */
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

/**
 * 内存条目创建输入验证
 */
export const CreateMemoryEntrySchema = MemoryEntrySchema.omit({
  id: true,
  embedding: true,
  createdAt: true,
  updatedAt: true
});

/**
 * 内存条目创建输入类型
 */
export type CreateMemoryEntry = z.infer<typeof CreateMemoryEntrySchema>;

/**
 * 内存搜索选项
 */
export interface MemorySearchOptions {
  limit?: number;
  threshold?: number;
  metric?: DistanceMetric;
  filter?: Record<string, unknown>;
}

/**
 * 内存搜索结果
 */
export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  distance: number;
}

/**
 * 内存管理器配置
 */
export interface MemoryManagerConfig {
  dimension: number;
  metric: DistanceMetric;
  maxSize?: number;
  indexType?: 'flat' | 'hnsw' | 'ivf';
  indexParams?: Record<string, unknown>;
}

/**
 * 内存批处理操作类型
 */
export interface MemoryBatchOperation {
  type: 'add' | 'update' | 'delete';
  entry: MemoryEntry | CreateMemoryEntry;
  id?: string;
}
