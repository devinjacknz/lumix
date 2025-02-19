export * from './base';
export * from './memory';
export * from './dialogue';

import {
  Vector,
  DistanceMetric,
  DialogueHistory,
  DialogueSession,
  DialogueMessage,
  MemoryEntry,
  CreateMemoryEntry,
  MemorySearchOptions,
  MemorySearchResult,
  MemoryManagerConfig,
  MemoryBatchOperation
} from '@lumix/types';

export {
  Vector,
  DistanceMetric,
  DialogueHistory,
  DialogueSession,
  DialogueMessage,
  MemoryEntry,
  CreateMemoryEntry,
  MemorySearchOptions,
  MemorySearchResult,
  MemoryManagerConfig,
  MemoryBatchOperation
};

// Re-export types from @lumix/types
export type {
  // Base types
  BaseConfig,
  BaseResult,
  BaseManager,
  // Knowledge types
  KnowledgeItem,
  KnowledgeResult,
  KnowledgeRetrievalResult,
  KnowledgeRetrievalOptions,
  KnowledgeManagerConfig,
  // Database types
  DatabaseConfig,
  DatabaseAdapter,
  // Chain types
  ChainType,
  ChainAdapter,
  ChainAddress,
  AddressDerivationOptions,
  // Messaging types
  MessagingMiddleware,
  MiddlewareFunction,
  MessagingConfig,
  MessagingEvent,
  MessagingPayload,
  MessagingResponse,
  MessagingError,
  // Dialogue types
  Message,
  DialogueContext,
  DialogueHistory,
  DialogueSession,
  DialogueManagerConfig,
  DialogueManagerInterface,
  // Message role
  MessageRole
} from '@lumix/types';

// Plugin types
export type {
  Plugin,
  PluginManager,
  PluginContext,
  PluginAPI,
  PluginHooks,
  PluginUtils,
  PluginMetadata
} from './plugin';

// Helius types
export type {
  HeliusConfig,
  HeliusClient
} from './helius';

// Error types
export type {
  BaseError,
  KnowledgeError,
  ValidationError,
  ConfigurationError,
  StorageError,
  RetrievalError,
  ModelError,
  ResourceLimitError,
  PermissionError,
  NetworkError,
  TimeoutError,
  ConcurrencyError,
  NotFoundError,
  DuplicateError,
  RAGError
} from './errors';

// Dialog types
export type {
  DialogSearchOptions,
  DialogSearchResult,
  DialogHistoryManager
} from './dialog';

// Agent types
export type {
  AgentConfig,
  AgentOptions,
  AgentError,
  ConsultationMode
} from './agent';

// Cache types
export type { CacheError } from '../cache';

// Database types
export type { DatabaseError } from '../database';

// Config types
export type { ConfigError } from '../config';
