import { DatabaseAdapter, DatabaseConfig, DatabaseResult, QueryOptions } from './adapter';
import { MemoryCache } from '../cache/memory';
import { BaseSQLiteAdapter, SQLiteConfig } from '@lumix/adapter-sqlite';

/**
 * SQLite数据库适配器实现
 * 使用@lumix/adapter-sqlite提供底层功能
 */
export class SQLiteAdapter extends DatabaseAdapter {
  private baseAdapter: BaseSQLiteAdapter;
  private queryCache: MemoryCache;

  constructor(config: DatabaseConfig) {
    super(config);
    this.baseAdapter = new BaseSQLiteAdapter({
      type: 'sqlite',
      path: config.database,
      verbose: true
    });
    this.queryCache = new MemoryCache({
      maxSize: 1000,
      ttl: 5 * 60 * 1000 // 5 minutes cache
    });
  }

  async connect(): Promise<DatabaseResult<void>> {
    try {
      await this.queryCache.init();
      await this.baseAdapter.optimize(); // Enable optimizations
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async disconnect(): Promise<DatabaseResult<void>> {
    try {
      await this.queryCache.close();
      await this.baseAdapter.disconnect();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async create<T extends object>(collection: string, data: T): Promise<DatabaseResult<T>> {
    try {
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = Array(values.length).fill('?').join(',');

      const sql = `INSERT INTO ${collection} (${columns.join(',')}) VALUES (${placeholders})`;
      await this.baseAdapter.execute(sql, values);
      await this.queryCache.clear(); // Invalidate cache
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async findOne<T extends object>(collection: string, query: Partial<T>): Promise<DatabaseResult<T>> {
    try {
      const cacheKey = `${collection}:findOne:${JSON.stringify(query)}`;
      const cached = await this.queryCache.get<T>(cacheKey);
      if (cached?.success && cached.data) {
        return { success: true, data: cached.data };
      }

      const { conditions, values } = this.buildWhereClause(query);
      const sql = `SELECT * FROM ${collection} WHERE ${conditions} LIMIT 1`;
      const result = await this.baseAdapter.queryOne<T>(sql, values);

      if (result) {
        await this.queryCache.set(cacheKey, result);
        return { success: true, data: result };
      }

      return {
        success: false,
        error: new Error('Record not found')
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async find<T extends object>(
    collection: string,
    query: Partial<T>,
    options: QueryOptions = {}
  ): Promise<DatabaseResult<T[]>> {
    try {
      const cacheKey = `${collection}:find:${JSON.stringify({ query, options })}`;
      const cached = await this.queryCache.get<T[]>(cacheKey);
      if (cached?.success && cached.data) {
        return { success: true, data: cached.data };
      }

      const { conditions, values } = this.buildWhereClause(query);
      let sql = `SELECT * FROM ${collection}`;
      
      if (conditions) {
        sql += ` WHERE ${conditions}`;
      }

      if (options.orderBy) {
        sql += ` ORDER BY ${options.orderBy} ${options.order || 'ASC'}`;
        await this.baseAdapter.createIndex(collection, [options.orderBy]);
      }

      if (options.limit) {
        sql += ` LIMIT ${options.limit}`;
        if (options.offset) {
          sql += ` OFFSET ${options.offset}`;
        }
      }

      const results = await this.baseAdapter.query<T[]>(sql, values);
      await this.queryCache.set(cacheKey, results);
      return { success: true, data: results };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async update<T extends object>(
    collection: string,
    query: Partial<T>,
    data: Partial<T>
  ): Promise<DatabaseResult<T>> {
    try {
      const { conditions, values: whereValues } = this.buildWhereClause(query);
      const { setClause, values: setValues } = this.buildSetClause(data);

      const sql = `UPDATE ${collection} SET ${setClause} WHERE ${conditions}`;
      await this.baseAdapter.execute(sql, [...setValues, ...whereValues]);

      await this.queryCache.clear(); // Invalidate cache
      return { success: true, data: data as T };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async delete<T extends object>(collection: string, query: Partial<T>): Promise<DatabaseResult<boolean>> {
    try {
      const { conditions, values } = this.buildWhereClause(query);
      const sql = `DELETE FROM ${collection} WHERE ${conditions}`;
      await this.baseAdapter.execute(sql, values);

      await this.queryCache.clear(); // Invalidate cache
      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async batch<T extends object>(
    collection: string,
    operations: Array<{
      type: 'create' | 'update' | 'delete';
      data: T;
      query?: Partial<T>;
    }>
  ): Promise<DatabaseResult<T[]>> {
    try {
      const batchOps = operations.map(op => {
        switch (op.type) {
          case 'create': {
            const columns = Object.keys(op.data);
            const values = Object.values(op.data);
            const placeholders = Array(values.length).fill('?').join(',');
            return {
              sql: `INSERT INTO ${collection} (${columns.join(',')}) VALUES (${placeholders})`,
              params: values
            };
          }
          case 'update': {
            const { conditions, values: whereValues } = this.buildWhereClause(op.query!);
            const { setClause, values: setValues } = this.buildSetClause(op.data);
            return {
              sql: `UPDATE ${collection} SET ${setClause} WHERE ${conditions}`,
              params: [...setValues, ...whereValues]
            };
          }
          case 'delete': {
            const { conditions, values } = this.buildWhereClause(op.query!);
            return {
              sql: `DELETE FROM ${collection} WHERE ${conditions}`,
              params: values
            };
          }
        }
      });

      await this.baseAdapter.batch(batchOps);
      await this.queryCache.clear(); // Invalidate cache

      const results = operations
        .filter(op => op.type !== 'delete')
        .map(op => op.data);

      return { success: true, data: results };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async query<T>(query: string, params: unknown[] = []): Promise<DatabaseResult<T>> {
    try {
      const results = await this.baseAdapter.query<T>(query, params);
      return { success: true, data: results };
    } catch (err) {
      return {
        success: false,
        error: err as Error
      };
    }
  }

  private buildWhereClause(query: object): { conditions: string; values: unknown[] } {
    const conditions: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(query)) {
      conditions.push(`${key} = ?`);
      values.push(value);
    }

    return {
      conditions: conditions.join(' AND ') || '1=1',
      values
    };
  }

  private buildSetClause(data: object): { setClause: string; values: unknown[] } {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }

    return {
      setClause: setClauses.join(', '),
      values
    };
  }
}
