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

// Knowledge types
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

// Message types
export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system'
}

export interface Message {
  role: MessageRole;
  content: string;
  metadata?: Record<string, any>;
}

export interface DialogueManagerConfig extends BaseConfig {
  maxHistory?: number;
  persistHistory?: boolean;
}

export interface MiddlewareFunction {
  (message: any): Promise<any>;
}

export interface MessagingMiddleware {
  name: string;
  execute: MiddlewareFunction;
}

// Chain types
export interface ChainAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getAddress(options?: AddressDerivationOptions): Promise<string>;
}

export interface ChainAddress {
  address: string;
  privateKey?: string;
}

export interface AddressDerivationOptions {
  index?: number;
  path?: string;
}