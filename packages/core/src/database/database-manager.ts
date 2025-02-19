import { DatabaseAdapter, DatabaseConfig } from './types';
import { SQLiteAdapter } from './sqlite-adapter';
import { configManager } from '../config';
import { logger } from '../monitoring';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private adapter: DatabaseAdapter | null = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async initialize(): Promise<void> {
    const dbConfig: DatabaseConfig = {
      type: 'sqlite',
      path: configManager.getMetricsConfig().dbPath || './data/lumix.db',
      database: 'lumix'
    };

    try {
      this.adapter = new SQLiteAdapter(dbConfig);
      await this.adapter.connect();
      logger.info('Database', 'Successfully connected to database');
    } catch (error) {
      logger.error('Database', 'Failed to initialize database', { error });
      throw error;
    }
  }

  public getAdapter(): DatabaseAdapter {
    if (!this.adapter) {
      throw new Error('Database adapter not initialized');
    }
    return this.adapter;
  }

  public async shutdown(): Promise<void> {
    if (this.adapter) {
      try {
        await this.adapter.disconnect();
        logger.info('Database', 'Successfully disconnected from database');
      } catch (error) {
        logger.error('Database', 'Error disconnecting from database', { error });
        throw error;
      }
    }
  }

  public isInitialized(): boolean {
    return this.adapter !== null && this.adapter.isConnected();
  }
} 