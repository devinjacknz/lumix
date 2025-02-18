// Base types and interfaces
export * from './types/base';
export * from './types/target';
export * from './types/errors';

// Dialog and consultation
export * from './types/dialog';
export * from './types/agent';
export type { ConsultationMode } from './types/agent';

// Core functionality
export * from './dialogue';
export * from './cache';
export * from './database';

// Monitoring and metrics
export * from './monitoring';

// Chain adapters
export * from './chain';

// Configuration
export * from './config';

// Messaging
export * from './messaging';

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
