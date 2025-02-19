import { BaseConfig } from './base';

export interface VectorStoreConfig extends BaseConfig {
  dimension: number;
  similarity?: 'cosine' | 'euclidean' | 'dot';
  maxConnections?: number;
  efConstruction?: number;
  efSearch?: number;
}

export interface VectorSearchResult {
  id: string;
  vector: number[];
  score: number;
  metadata?: VectorMetadata;
}

export interface VectorStore {
  add(vectors: VectorDocument[]): Promise<void>;
  search(query: VectorQuery): Promise<VectorSearchResult[]>;
  delete(ids: string[]): Promise<void>;
  getStats(): Promise<VectorStats>;
}

export interface VectorDocument {
  id: string;
  vector: number[];
  metadata?: VectorMetadata;
}

export interface VectorMetadata {
  text?: string;
  source?: string;
  timestamp?: number;
  [key: string]: any;
}

export interface VectorQuery {
  vector: number[];
  k?: number;
  filter?: Record<string, any>;
}

export interface VectorIndex {
  id: string;
  dimension: number;
  size: number;
  createdAt: number;
  updatedAt: number;
}

export interface VectorStats {
  totalVectors: number;
  dimension: number;
  memoryUsage: number;
  indexSize: number;
  lastUpdated: number;
}
