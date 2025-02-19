import { BaseConfig } from './base';

export interface MessagingMiddleware {
  name: string;
  execute: MiddlewareFunction;
  emit: (event: string, data: any) => Promise<void>;
  on: (event: string, handler: (data: any) => void) => void;
  off: (event: string, handler: (data: any) => void) => void;
}

export interface MiddlewareFunction {
  (message: any): Promise<any>;
}

export interface MessagingConfig extends BaseConfig {
  provider: string;
  endpoint?: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
}

export interface MessagingEvent {
  id: string;
  type: string;
  payload: MessagingPayload;
  timestamp: number;
}

export interface MessagingPayload {
  sender: string;
  recipient: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface MessagingResponse {
  success: boolean;
  messageId?: string;
  error?: MessagingError;
  timestamp: number;
}

export interface MessagingError {
  code: string;
  message: string;
  details?: Record<string, any>;
}
