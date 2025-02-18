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

export interface DatabaseConfig {
  path: string;
  type: 'sqlite' | 'mysql' | 'postgres';
}

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<T>;
}

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