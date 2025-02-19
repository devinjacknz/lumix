import { z } from 'zod';

// Base interfaces
export interface KnowledgeItem {
  id: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface KnowledgeResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface KnowledgeRetrievalResult {
  item: KnowledgeItem;
  score: number;
}

export interface KnowledgeRetrievalOptions {
  limit?: number;
  threshold?: number;
  filters?: Record<string, any>;
}

export interface KnowledgeManagerConfig {
  namespace: string;
  options?: Record<string, any>;
}

export interface KnowledgeStats {
  totalItems: number;
  totalSize: number;
  averageEmbeddingSize: number;
  lastUpdated: Date;
}

// Abstract base class
export abstract class KnowledgeManager {
  protected config: KnowledgeManagerConfig;

  constructor(config: KnowledgeManagerConfig) {
    this.config = config;
  }

  abstract addItem(
    item: KnowledgeItem
  ): Promise<KnowledgeResult<KnowledgeItem>>;

  abstract search(
    query: string,
    options?: KnowledgeRetrievalOptions
  ): Promise<KnowledgeResult<KnowledgeRetrievalResult[]>>;

  abstract removeItem(id: string): Promise<KnowledgeResult<void>>;

  abstract clear(): Promise<KnowledgeResult<void>>;

  abstract stats(): Promise<KnowledgeResult<{
    itemCount: number;
    size: number;
  }>>;
}

// Zod Schemas
export const KnowledgeItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
  embedding: z.array(z.number()).optional(),
  timestamp: z.date().optional()
});

export const KnowledgeRetrievalResultSchema = z.object({
  item: KnowledgeItemSchema,
  score: z.number(),
  metadata: z.record(z.any()).optional()
});

export const KnowledgeManagerConfigSchema = z.object({
  namespace: z.string(),
  maxItems: z.number().optional(),
  ttl: z.number().optional(),
  embeddings: z.object({
    dimensions: z.number(),
    model: z.string()
  }).optional(),
  storage: z.object({
    type: z.enum(['memory', 'sqlite', 'postgres']),
    config: z.record(z.any())
  }).optional()
});

export const KnowledgeResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  metadata: z.object({
    timestamp: z.date(),
    duration: z.number()
  }).optional()
});

export const KnowledgeRetrievalOptionsSchema = z.object({
  limit: z.number().optional(),
  threshold: z.number().optional(),
  filter: z.record(z.any()).optional(),
  includeMetadata: z.boolean().optional()
});