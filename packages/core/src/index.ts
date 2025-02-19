// Types from @lumix/types
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

// Export core types and interfaces
export * from './types';

// Export monitoring modules
export * from './monitoring';
export * from './monitor/realtime';
export * from './monitor/thread-pool';
export * from './monitor/parallel-processor';
export * from './monitor/stream-processor';
export * from './monitor/data-compressor';

// Export metrics modules
export * from './metrics/collector';

// Export backtest modules
export * from './backtest/backtest-engine';
export * from './backtest/analysis/performance-analyzer';
export * from './backtest/analysis/risk-analyzer';
export * from './backtest/analysis/scenario-analyzer';
export * from './backtest/report/report-generator';

// Export LLM modules
export * from './llm/agent-manager';
export * from './llm/plugin-adapter';
export * from './llm/state-manager';

// Export dialogue modules
export * from './dialogue/dialogue-manager';

// Export utility modules
export * from './utils/logger';
