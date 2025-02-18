export * from './base';
export * from './memory';
export * from './dialogue';
export * from './persistence';

// Base types
export interface BaseConfig {
  name: string;
  version: string;
  description?: string;
}

export interface BaseResult {
  success: boolean;
  error?: string | Error;
  data?: any;
}

export interface BaseManager {
  initialize(): Promise<void>;
  destroy(): Promise<void>;
}

// Database types
export interface DatabaseConfig {
  path: string;
  type: 'sqlite' | 'mysql' | 'postgres';
}

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<T>;
}

// Event types
export interface Event {
  id: string;
  type: string;
  timestamp: number;
  data: any;
}

export interface EventEmitter {
  emit(event: Event): void;
  on(type: string, handler: (event: Event) => void): void;
  off(type: string, handler: (event: Event) => void): void;
}

// Dialogue types
export interface DialogueMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
}

export interface DialogueContext {
  messages: DialogueMessage[];
  metadata?: Record<string, any>;
}

export interface DialogueHistory {
  id: string;
  sessionId: string;
  messages: DialogueMessage[];
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface DialogueSession {
  id: string;
  userId: string;
  context: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

// Knowledge base types
export interface KnowledgeBase {
  add(key: string, value: any): Promise<void>;
  get(key: string): Promise<any>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Memory types
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

// Plugin types
export interface PluginConfig {
  name: string;
  version: string;
  enabled: boolean;
  [key: string]: any;
}

export interface Plugin {
  initialize(config: PluginConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
} 