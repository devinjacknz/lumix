export interface VectorStoreConfig {
  dimensions: number;
  similarity: 'cosine' | 'euclidean' | 'dot';
  namespace?: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, any>;
  vector?: number[];
}

export interface VectorStore {
  add(vectors: number[][], metadata?: Record<string, any>[]): Promise<void>;
  search(query: number[], k?: number): Promise<VectorSearchResult[]>;
  delete(ids: string[]): Promise<void>;
}
