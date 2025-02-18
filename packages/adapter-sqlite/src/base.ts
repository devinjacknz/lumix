import { Database } from 'sqlite3';
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
    return new Promise((resolve, reject) => {
      this.db = new Database(this.config.path, (err) => {
        if (err) {
          reject(err);
        } else {
          if (this.config.verbose) {
            this.db!.on('trace', (sql) => console.log('SQL:', sql));
          }
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }
      for (const stmt of this.preparedStatements.values()) {
        promisify(stmt.finalize.bind(stmt))();
      }
      this.preparedStatements.clear();
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.db = null;
          resolve();
        }
      });
    });
  }

  /**
   * 执行SQL查询并返回所有结果
   */
  async query<T>(sql: string, params: any[] = []): Promise<T> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          reject(new SQLiteError('Query failed', 'QUERY_ERROR', err));
        } else {
          resolve(rows as T);
        }
      });
    });
  }

  /**
   * 执行SQL查询并返回单个结果
   */
  async queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
    try {
      const stmt = await this.prepare(sql);
      return await promisify(stmt.get.bind(stmt))(params);
    } catch (error) {
      throw new SQLiteError('Query failed', 'QUERY_ERROR', error as Error);
    }
  }

  /**
   * 执行SQL更新
   */
  async execute(sql: string, params: any[] = []): Promise<number> {
    try {
      const stmt = await this.prepare(sql);
      const result = await promisify(stmt.run.bind(stmt))(params);
      return result.changes;
    } catch (error) {
      throw new SQLiteError('Execute failed', 'EXECUTE_ERROR', error as Error);
    }
  }

  /**
   * 执行批量操作
   */
  async batch(operations: Array<{ sql: string; params: any[] }>): Promise<void> {
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
   * 获取预处理语句
   */
  private async prepare(sql: string): Promise<any> {
    let stmt = this.preparedStatements.get(sql);
    if (!stmt) {
      stmt = await promisify(this.db!.prepare.bind(this.db!))(sql);
      this.preparedStatements.set(sql, stmt);
    }
    return stmt;
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
