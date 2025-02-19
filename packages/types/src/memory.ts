export interface Vector {
  dimensions: number;
  values: number[];
}

export type DistanceMetric = 'euclidean' | 'cosine' | 'manhattan';

export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface CreateMemoryEntry {
  content: string;
  metadata?: Record<string, any>;
}

export interface MemorySearchOptions {
  limit?: number;
  threshold?: number;
  metadata?: Record<string, any>;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface MemoryManagerConfig {
  dimensions: number;
  distanceMetric?: DistanceMetric;
  indexPath?: string;
}

export interface MemoryBatchOperation {
  type: 'add' | 'update' | 'delete';
  entry: MemoryEntry | string;
} 