// Base types and interfaces
export * from './types/base';
export * from './types/target';
export * from './types/errors';

// Dialog and consultation
export * from './types/dialog';
export * from './types/agent';

// Core functionality
export {
  DialogueManager,
  DialogueManagerConfig,
  Message,
  MessageRole
} from './dialogue';

export {
  CacheManager,
  SecureCache,
  CacheError
} from './cache';

export {
  DatabaseManager,
  DatabaseConfig,
  DatabaseError
} from './database';

// Monitoring and metrics
export {
  Logger,
  MetricsService,
  AlertManager,
  SystemMonitor
} from './monitoring';

// Chain adapters
export {
  ChainAdapter,
  EthereumAdapter,
  SolanaAdapter
} from './chain';

// Configuration
export {
  ConfigManager,
  ConfigError
} from './config';

// Messaging
export {
  MessagingMiddleware,
  MiddlewareFunction
} from './messaging';

// Knowledge management
export {
  KnowledgeManager,
  KnowledgeItem,
  KnowledgeResult,
  KnowledgeRetrievalResult,
  KnowledgeRetrievalOptions,
  KnowledgeManagerConfig,
  KnowledgeItemSchema,
  KnowledgeRetrievalResultSchema,
  KnowledgeManagerConfigSchema,
  KnowledgeResultSchema,
  KnowledgeRetrievalOptionsSchema
} from './types/base';
