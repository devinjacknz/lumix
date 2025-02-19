import { BaseConfig } from './base';

export interface KnowledgeItem {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  timestamp?: Date;
}

export interface KnowledgeResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  metadata?: {
    timestamp: Date;
    duration: number;
  };
}

export interface KnowledgeRetrievalResult {
  item: KnowledgeItem;
  score: number;
  distance?: number;
}

export interface KnowledgeRetrievalOptions {
  limit?: number;
  minScore?: number;
  filter?: Record<string, any>;
  includeMetadata?: boolean;
}

export interface KnowledgeManagerConfig extends BaseConfig {
  namespace?: string;
  maxItems?: number;
  embedModel?: string;
  similarityThreshold?: number;
  storageType: 'memory' | 'file' | 'database';
  storagePath?: string;
}

export interface KnowledgeItemSchema {
  id: string;
  content: string;
  metadata?: Record<string, any>;
}
