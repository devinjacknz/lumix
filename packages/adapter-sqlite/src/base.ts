import { Database, OPEN_READWRITE, OPEN_CREATE } from 'sqlite3';
import { promisify } from 'util';
import { DatabaseAdapter, DatabaseConfig } from '@lumix/types';

export interface SQLiteConfig extends DatabaseConfig {
  type: 'sqlite';
  path: string;
  mode?: number;
  verbose?: boolean;
}

export class SQLiteError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'SQLiteError';
  }
}

/**
 * 基础SQLite适配器
 * 提供底层数据库操作
 */
export class BaseSQLiteAdapter implements DatabaseAdapter {
  protected db: Database | null = null;
  protected config: SQLiteConfig;
  private preparedStatements: Map<string, any> = new Map();

  constructor(config: SQLiteConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.db) {
      console.log('[connect] Database already connected');
      return;
    }

    console.log('[connect] Connecting to database at:', this.config.path);
    return new Promise((resolve, reject) => {
      try {
        const db = new Database(this.config.path, OPEN_READWRITE | OPEN_CREATE, (err) => {
          if (err) {
            console.error('[connect] Connection error:', err);
            this.db = null;
            reject(new SQLiteError('Failed to connect', 'CONNECT_ERROR', err));
            return;
          }
          
          console.log('[connect] Successfully connected to database');
          this.db = db;
          
          if (this.config.verbose) {
            this.db.on('trace', (sql) => console.log('[SQL]:', sql));
          }
          
          resolve();
        });
      } catch (err) {
        console.error('[connect] Error creating Database instance:', err);
        this.db = null;
        reject(new SQLiteError('Failed to create database instance', 'DB_CREATE_ERROR', err as Error));
      }
    });
  }

  async disconnect(): Promise<void> {
    console.log('[disconnect] Starting database disconnect');
    
    if (!this.db) {
      console.log('[disconnect] No database connection to close');
      return;
    }

    try {
      // First finalize all prepared statements
      console.log('[disconnect] Finalizing prepared statements');
      for (const [sql, stmt] of this.preparedStatements.entries()) {
        try {
          if (stmt && typeof stmt.finalize === 'function') {
            await new Promise<void>((resolve, reject) => {
              stmt.finalize((err: Error | null) => {
                if (err) {
                  console.error(`[disconnect] Error finalizing statement for SQL: ${sql}`, err);
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          }
        } catch (err) {
          console.error(`[disconnect] Failed to finalize statement for SQL: ${sql}`, err);
        }
      }
      this.preparedStatements.clear();

      // Then close the database
      const db = this.db;
      this.db = null; // Clear reference first to prevent new operations
      
      console.log('[disconnect] Closing database connection');
      await new Promise<void>((resolve, reject) => {
        db.close((err) => {
          if (err) {
            console.error('[disconnect] Error closing database:', err);
            reject(err);
          } else {
            console.log('[disconnect] Database closed successfully');
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('[disconnect] Failed to disconnect:', error);
      throw new SQLiteError('Failed to disconnect', 'DISCONNECT_ERROR', error as Error);
    }
  }

  /**
   * 执行SQL查询并返回所有结果
   */
  async query<T>(sql: string, params: any[] = []): Promise<T> {
    if (!this.db) {
      console.log('[query] No connection, connecting first');
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const stmt = this.db!.prepare(sql);
      const key = `${sql}-${Date.now()}`;
      this.preparedStatements.set(key, stmt);

      stmt.all(params, (err, rows) => {
        if (err) {
          reject(new SQLiteError('Query failed', 'QUERY_ERROR', err));
        } else {
          resolve(rows as T);
        }
        // Clean up statement after use
        stmt.finalize();
        this.preparedStatements.delete(key);
      });
    });
  }

  /**
   * 执行SQL查询并返回单个结果
   */
  async queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
    if (!this.db) {
      console.log('[queryOne] No connection, connecting first');
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const stmt = this.db!.prepare(sql);
      const key = `${sql}-${Date.now()}`;
      this.preparedStatements.set(key, stmt);

      stmt.get(params, (err, row) => {
        if (err) {
          reject(new SQLiteError('Query failed', 'QUERY_ERROR', err));
        } else {
          resolve(row ? (row as T) : null);
        }
        // Clean up statement after use
        stmt.finalize();
        this.preparedStatements.delete(key);
      });
    });
  }

  /**
   * 执行SQL更新
   */
  async execute(sql: string, params: any[] = []): Promise<number> {
    console.log('[execute] Starting execution of:', sql);
    console.log('[execute] With params:', params);
    
    if (!this.db) {
      console.log('[execute] No connection, connecting first');
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('[execute] Running SQL with database instance:', !!this.db);
        const stmt = this.db!.prepare(sql);
        const key = `${sql}-${Date.now()}`;
        this.preparedStatements.set(key, stmt);
        
        const that = this;
        stmt.run(params, function(this: { lastID: number; changes: number }, err) {
          if (err) {
            console.error('[execute] Error executing SQL:', err);
            reject(new SQLiteError('Execute failed', 'EXECUTE_ERROR', err));
          } else {
            console.log('[execute] Successfully executed SQL, changes:', this.changes);
            resolve(this.changes);
          }
          // Clean up statement after use
          stmt.finalize();
          that.preparedStatements.delete(key);
        });
      } catch (err) {
        console.error('[execute] Unexpected error during execution:', err);
        reject(new SQLiteError('Execute failed', 'EXECUTE_ERROR', err as Error));
      }
    });
  }

  /**
   * 执行批量操作
   */
  async batch(operations: Array<{ sql: string; params: any[] }>): Promise<void> {
    if (!this.db) {
      console.log('[batch] No connection, connecting first');
      await this.connect();
    }

    await this.beginTransaction();
    try {
      for (const op of operations) {
        await this.execute(op.sql, op.params);
      }
      await this.commit();
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  /**
   * 开始事务
   */
  async beginTransaction(): Promise<void> {
    await this.execute('BEGIN TRANSACTION');
  }

  /**
   * 提交事务
   */
  async commit(): Promise<void> {
    await this.execute('COMMIT');
  }

  /**
   * 回滚事务
   */
  async rollback(): Promise<void> {
    await this.execute('ROLLBACK');
  }

  /**
   * 优化数据库
   */
  async optimize(): Promise<void> {
    // Enable WAL mode for better concurrency
    await this.execute('PRAGMA journal_mode = WAL');
    
    // Other optimizations
    await this.execute('PRAGMA synchronous = NORMAL');
    await this.execute('PRAGMA temp_store = MEMORY');
    await this.execute('PRAGMA cache_size = -2000'); // Use 2MB cache
    
    // Vacuum database
    await this.execute('VACUUM');
  }

  /**
   * 创建索引
   */
  async createIndex(table: string, columns: string[], unique = false): Promise<void> {
    const indexName = `idx_${table}_${columns.join('_')}`;
    const uniqueStr = unique ? 'UNIQUE' : '';
    await this.execute(
      `CREATE ${uniqueStr} INDEX IF NOT EXISTS ${indexName} ON ${table}(${columns.join(',')})`
    );
  }

  /**
   * 删除索引
   */
  async dropIndex(indexName: string): Promise<void> {
    await this.execute(`DROP INDEX IF EXISTS ${indexName}`);
  }

  /**
   * 获取表信息
   */
  async getTableInfo(table: string): Promise<any[]> {
    return await this.query('PRAGMA table_info(?)', [table]);
  }

  /**
   * 获取索引信息
   */
  async getIndexInfo(table: string): Promise<any[]> {
    return await this.query('PRAGMA index_list(?)', [table]);
  }
}
