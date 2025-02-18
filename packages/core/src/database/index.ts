import { DatabaseAdapter, DatabaseConfig } from '@lumix/types';

export { DatabaseAdapter, DatabaseConfig };

export class Database {
  private adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  async connect(): Promise<void> {
    await this.adapter.connect();
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  async query<T>(sql: string, params?: any[]): Promise<T> {
    return this.adapter.query<T>(sql, params);
  }
}

export * from './types';
export * from './sqlite-adapter';
export * from './database-manager';

// 导出数据库管理器单例
import { DatabaseManager } from './database-manager';
export const databaseManager = DatabaseManager.getInstance();
