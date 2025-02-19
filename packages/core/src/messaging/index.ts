export * from './types';
export { MessagingMiddlewareManager } from './middleware';
export { MiddlewareFunction, MessagingMiddleware } from '@lumix/types';

import { MessagingMiddlewareManager } from './middleware';
import { MiddlewareConfig } from './types';

// 默认中间件配置
const defaultConfig: MiddlewareConfig = {
  queueSize: 1000,
  retryAttempts: 3,
  retryDelay: 1000,
  eventTTL: 3600,
  enablePersistence: true
};

// 导出中间件单例实例
export const messagingMiddleware = MessagingMiddlewareManager.getInstance(defaultConfig); 