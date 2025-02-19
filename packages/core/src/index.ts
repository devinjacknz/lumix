// Types from @lumix/types
export type {
  // Base types
  BaseConfig,
  BaseResult,
  BaseManager,
  KnowledgeItem,
  KnowledgeResult,
  KnowledgeRetrievalResult,
  KnowledgeRetrievalOptions,
  KnowledgeManagerConfig,
  // Database types
  DatabaseConfig,
  DatabaseAdapter,
  // Chain types
  ChainAdapter,
  // Messaging types
  MessagingMiddleware,
  MiddlewareFunction,
  // Dialogue types
  DialogueMessage as Message,
  MessageRole,
  DialogueManagerConfig
} from '@lumix/types';

// Target types
export type {
  Target,
  TargetType,
  TargetStatus,
  TargetPriority,
  TargetRelation,
  RelationType,
  TargetQueryOptions
} from './types/target';

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
} from './types/errors';

// Dialog types
export type {
  DialogSearchOptions,
  DialogSearchResult,
  DialogHistoryManager
} from './types/dialog';

// Agent types
export type {
  AgentConfig,
  AgentOptions,
  AgentError,
  ConsultationMode
} from './types/agent';

// Core functionality
export { DialogueManager } from './dialogue';

// Cache
export { CacheManager, SecureCache } from './cache';
export type { CacheError } from './cache';

// Database
export { DatabaseManager } from './database';
export type { DatabaseError } from './database';

// Monitoring and metrics
export { Logger, MetricsService, AlertManager, SystemMonitor } from './monitoring';

// Chain adapters
export { EthereumAdapter, SolanaAdapter } from './chain';

// Configuration
export { ConfigManager } from './config';
export type { ConfigError } from './config';

// Knowledge management
export { KnowledgeManager } from './types/base';
