// Base types
export type { BaseConfig, BaseResult, BaseManager } from './base';

// Event types
export type { Event, EventEmitter } from './events';

// Knowledge types
export type {
  KnowledgeItem,
  KnowledgeResult,
  KnowledgeRetrievalResult,
  KnowledgeRetrievalOptions,
  KnowledgeManagerConfig,
  KnowledgeItemSchema
} from './knowledge';

// Dialogue types
export type {
  Message as DialogueMessage,
  DialogueContext,
  DialogueHistory,
  DialogueSession,
  DialogueManagerConfig,
  DialogueManagerInterface
} from './dialogue';
export { MessageRole } from './dialogue';

// Memory types
export type {
  Vector,
  DistanceMetric,
  MemoryEntry,
  CreateMemoryEntry,
  MemorySearchOptions,
  MemorySearchResult,
  MemoryManagerConfig,
  MemoryBatchOperation
} from './memory';

// Persistence types
export type { IPersistenceAdapter, PersistenceOptions } from './persistence';

// Error types
export type { ErrorOptions } from './errors';
export { BaseError } from './errors';

// Chain types
export type { ChainType, ChainAdapter, ChainAddress, AddressDerivationOptions } from './chain';

// Database types
export type { DatabaseConfig, DatabaseAdapter } from './database';

// Messaging types
export type { MessagingMiddleware, MiddlewareFunction } from './messaging';

// Plugin types
export type { PluginConfig, Plugin } from './plugin';

// Transaction types
export type { TransactionConfig, TransactionResult } from './transaction';
export { TransactionType } from './transaction';

// Vector store types
export type { VectorStoreConfig, VectorSearchResult, VectorStore } from './vectorstore';                  