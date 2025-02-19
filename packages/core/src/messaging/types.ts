import { ChainType } from '../config/types';
import { TransactionRecord } from '../database/types';
import { LogEntry } from '../monitoring/types';

// 消息优先级
export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

// 消息状态
export enum MessageStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// 基础消息接口
export interface Message {
  id: string;
  type: string;
  priority: MessagePriority;
  timestamp: Date;
  status: MessageStatus;
  payload: any;
  metadata?: Record<string, any>;
}

// 事件类型
export enum EventType {
  // 系统事件
  SYSTEM_STARTUP = 'system:startup',
  SYSTEM_SHUTDOWN = 'system:shutdown',
  CONFIG_UPDATED = 'config:updated',
  
  // 链相关事件
  CHAIN_BLOCK = 'chain:block',
  CHAIN_TRANSACTION = 'chain:transaction',
  CHAIN_ERROR = 'chain:error',
  
  // 钱包事件
  WALLET_CREATED = 'wallet:created',
  WALLET_IMPORTED = 'wallet:imported',
  WALLET_UPDATED = 'wallet:updated',
  
  // 交易事件
  TRANSACTION_CREATED = 'transaction:created',
  TRANSACTION_SIGNED = 'transaction:signed',
  TRANSACTION_SENT = 'transaction:sent',
  TRANSACTION_CONFIRMED = 'transaction:confirmed',
  TRANSACTION_FAILED = 'transaction:failed',
  
  // Token事件
  TOKEN_IMPORTED = 'token:imported',
  TOKEN_UPDATED = 'token:updated',
  TOKEN_TRANSFER = 'token:transfer',
  
  // 监控事件
  METRICS_UPDATED = 'metrics:updated',
  ALERT_TRIGGERED = 'alert:triggered',
  LOG_ENTRY = 'log:entry'
}

// 事件接口
export interface Event<T = any> {
  type: EventType;
  timestamp: Date;
  data: T;
  metadata?: Record<string, any>;
}

// 链事件数据
export interface ChainEventData {
  chain: ChainType;
  blockNumber?: number;
  transaction?: TransactionRecord;
  error?: Error;
}

// 钱包事件数据
export interface WalletEventData {
  chain: ChainType;
  address: string;
  action: string;
  details?: Record<string, any>;
}

// 监控事件数据
export interface MonitoringEventData {
  metrics?: Record<string, number>;
  alert?: {
    level: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    details?: any;
  };
  log?: LogEntry;
}

// 消息处理器接口
export interface MessageHandler {
  handle(message: Message): Promise<void>;
  canHandle(message: Message): boolean;
}

// 事件监听器接口
export interface EventListener<T = any> {
  onEvent(event: Event<T>): Promise<void>;
}

// 中间件配置
export interface MiddlewareConfig {
  queueSize: number;
  retryAttempts: number;
  retryDelay: number;
  eventTTL: number;
  enablePersistence: boolean;
}

// 中间件统计
export interface MiddlewareStats {
  messagesProcessed: number;
  messagesFailed: number;
  eventsEmitted: number;
  activeListeners: number;
  queueSize: number;
  averageProcessingTime: number;
} 