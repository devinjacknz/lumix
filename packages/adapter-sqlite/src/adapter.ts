import { Database } from "sqlite3";
import { BaseConfig, BaseResult } from "@lumix/types";

export interface CacheConfig extends BaseConfig {
  maxSize?: number;
  maxAge?: number;
}

export interface CacheResult<T> extends BaseResult {
  data?: T;
}

export interface CacheStats {
  totalKeys: number;
  totalSize: number;
  expiredKeys: number;
}

export abstract class CacheAdapter {
  protected config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  abstract init(): Promise<CacheResult<void>>;
  abstract close(): Promise<CacheResult<void>>;
  abstract set<T>(key: string, value: T, ttl?: number): Promise<CacheResult<void>>;
  abstract get<T>(key: string): Promise<CacheResult<T | null>>;
  abstract delete(key: string): Promise<CacheResult<boolean>>;
  abstract clear(): Promise<CacheResult<void>>;
  abstract stats(): Promise<CacheResult<CacheStats>>;
}

/**
 * SQLite缓存适配器配置
 */
export interface SQLiteCacheConfig extends CacheConfig {
  /**
   * 数据库文件路径
   */
  dbPath: string;

  /**
   * 表名
   */
  tableName?: string;
}

/**
 * SQLite缓存适配器
 */
export class SQLiteCacheAdapter extends CacheAdapter {
  private db: Database;
  private tableName: string;
  private initialized = false;

  constructor(config: SQLiteCacheConfig) {
    super(config);
    this.tableName = config.tableName || "cache";
    this.db = new Database(config.dbPath);
  }

  async init(): Promise<CacheResult<void>> {
    try {
      if (this.initialized) {
        return { success: true };
      }

      await new Promise<void>((resolve, reject) => {
        this.db.run(
          `CREATE TABLE IF NOT EXISTS ${this.tableName} (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            expires_at INTEGER
          )`,
          (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      this.initialized = true;
      return { success: true };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to initialize SQLite cache: ${err.message}`),
      };
    }
  }

  async close(): Promise<CacheResult<void>> {
    try {
      await new Promise<void>((resolve, reject) => {
        this.db.close((err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return { success: true };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to close SQLite cache: ${err.message}`),
      };
    }
  }

  async set<T>(
    key: string,
    value: T,
    ttl?: number
  ): Promise<CacheResult<void>> {
    try {
      const expiresAt = ttl ? Date.now() + ttl : null;
      await new Promise<void>((resolve, reject) => {
        this.db.run(
          `INSERT OR REPLACE INTO ${this.tableName} (key, value, expires_at) VALUES (?, ?, ?)`,
          [key, JSON.stringify(value), expiresAt],
          (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      return { success: true };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to set cache key ${key}: ${err.message}`),
      };
    }
  }

  async get<T>(key: string): Promise<CacheResult<T | null>> {
    try {
      interface CacheRow {
        value: string;
        expires_at: number | null;
      }

      const result = await new Promise<CacheRow | undefined>((resolve, reject) => {
        this.db.get<CacheRow>(
          `SELECT value, expires_at FROM ${this.tableName} WHERE key = ?`,
          [key],
          (err: Error | null, row: CacheRow | undefined) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!result) {
        return { success: true, data: null };
      }

      if (
        result.expires_at !== null &&
        typeof result.expires_at === "number" &&
        result.expires_at < Date.now()
      ) {
        await this.delete(key);
        return { success: true, data: null };
      }

      return { success: true, data: JSON.parse(result.value) };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to get cache key ${key}: ${err.message}`),
      };
    }
  }

  async delete(key: string): Promise<CacheResult<boolean>> {
    try {
      const result = await new Promise<number>((resolve, reject) => {
        this.db.run(
          `DELETE FROM ${this.tableName} WHERE key = ?`,
          [key],
          function(this: { changes: number }, err: Error | null) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });
      return { success: true, data: result > 0 };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to delete cache key ${key}: ${err.message}`),
      };
    }
  }

  async clear(): Promise<CacheResult<void>> {
    try {
      await new Promise<void>((resolve, reject) => {
        this.db.run(`DELETE FROM ${this.tableName}`, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return { success: true };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to clear cache: ${err.message}`),
      };
    }
  }

  async mget<T>(keys: string[]): Promise<CacheResult<(T | null)[]>> {
    try {
      interface CacheRow {
        key: string;
        value: string;
        expires_at: number | null;
      }

      const placeholders = keys.map(() => "?").join(",");
      const results = await new Promise<CacheRow[]>((resolve, reject) => {
        this.db.all<CacheRow>(
          `SELECT key, value, expires_at FROM ${this.tableName} WHERE key IN (${placeholders})`,
          keys,
          (err: Error | null, rows: CacheRow[]) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const valueMap = new Map(
        results.map((row) => [
          row.key,
          {
            value: JSON.parse(row.value) as T,
            expires_at: row.expires_at,
          },
        ])
      );

      const values = keys.map((key) => {
        const entry = valueMap.get(key);
        if (!entry) return null;
        if (
          entry.expires_at !== null &&
          typeof entry.expires_at === "number" &&
          entry.expires_at < Date.now()
        ) {
          this.delete(key).catch(() => {}); // 异步删除过期项
          return null;
        }
        return entry.value;
      });

      return { success: true, data: values };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to get multiple cache keys: ${err.message}`),
      };
    }
  }

  async mset<T>(
    items: Array<{ key: string; value: T; ttl?: number }>
  ): Promise<CacheResult<void>> {
    try {
      await new Promise<void>((resolve, reject) => {
        const stmt = this.db.prepare(
          `INSERT OR REPLACE INTO ${this.tableName} (key, value, expires_at) VALUES (?, ?, ?)`
        );

        this.db.serialize(() => {
          this.db.run("BEGIN TRANSACTION");

          items.forEach((item) => {
            const expiresAt = item.ttl ? Date.now() + item.ttl : null;
            stmt.run(
              item.key,
              JSON.stringify(item.value),
              expiresAt,
              (err: Error | null) => {
                if (err) reject(err);
              }
            );
          });

          this.db.run("COMMIT", (err: Error | null) => {
            if (err) reject(err);
            else {
              stmt.finalize((err: Error | null) => {
                if (err) reject(err);
                else resolve();
              });
            }
          });
        });
      });

      return { success: true };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to set multiple cache keys: ${err.message}`),
      };
    }
  }

  async mdelete(keys: string[]): Promise<CacheResult<boolean[]>> {
    try {
      const placeholders = keys.map(() => "?").join(",");
      const result = await new Promise<Record<string, boolean>>(
        (resolve, reject) => {
          this.db.run(
            `DELETE FROM ${this.tableName} WHERE key IN (${placeholders})`,
            keys,
            function(this: { changes: number }, err: Error | null) {
              if (err) reject(err);
              else {
                const changes = this.changes;
                const results = keys.reduce<Record<string, boolean>>((acc, key) => {
                  acc[key] = changes > 0;
                  return acc;
                }, {});
                resolve(results);
              }
            }
          );
        }
      );

      return {
        success: true,
        data: keys.map((key) => result[key] || false),
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to delete multiple cache keys: ${err.message}`),
      };
    }
  }

  async stats(): Promise<CacheResult<CacheStats>> {
    try {
      interface StatsRow {
        total_keys: number;
        total_size: number;
        expired_keys: number;
      }

      const row = await new Promise<StatsRow>((resolve, reject) => {
        this.db.get<StatsRow>(
          `SELECT 
            COUNT(*) as total_keys,
            SUM(LENGTH(value)) as total_size,
            SUM(CASE WHEN expires_at < ? THEN 1 ELSE 0 END) as expired_keys
          FROM ${this.tableName}`,
          [Date.now()],
          (err: Error | null, row: StatsRow) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      return {
        success: true,
        data: {
          totalKeys: row?.total_keys || 0,
          totalSize: row?.total_size || 0,
          expiredKeys: row?.expired_keys || 0
        }
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to get cache stats: ${err.message}`)
      };
    }
  }

  async has(key: string): Promise<CacheResult<boolean>> {
    try {
      interface ExpiryRow {
        expires_at: number | null;
      }

      const result = await new Promise<boolean>((resolve, reject) => {
        this.db.get<ExpiryRow>(
          `SELECT expires_at FROM ${this.tableName} WHERE key = ?`,
          [key],
          (err: Error | null, row: ExpiryRow | undefined) => {
            if (err) reject(err);
            else {
              if (!row) {
                resolve(false);
                return;
              }
              if (
                row.expires_at !== null &&
                typeof row.expires_at === "number" &&
                row.expires_at < Date.now()
              ) {
                this.delete(key).catch(() => {}); // 异步删除过期项
                resolve(false);
              } else {
                resolve(true);
              }
            }
          }
        );
      });

      return { success: true, data: result };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to check cache key ${key}: ${err.message}`),
      };
    }
  }

  async keys(pattern?: string): Promise<CacheResult<string[]>> {
    try {
      interface KeyRow {
        key: string;
      }

      const sql = pattern
        ? `SELECT key FROM ${this.tableName} WHERE key LIKE ?`
        : `SELECT key FROM ${this.tableName}`;
      const params = pattern ? [pattern.replace(/\*/g, "%")] : [];

      const keys = await new Promise<string[]>((resolve, reject) => {
        this.db.all<KeyRow>(
          sql,
          params,
          (err: Error | null, rows: KeyRow[]) => {
            if (err) reject(err);
            else resolve((rows || []).map((row) => row.key));
          }
        );
      });

      return { success: true, data: keys };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to get cache keys: ${err.message}`),
      };
    }
  }

  async ttl(key: string): Promise<CacheResult<number>> {
    try {
      interface ExpiryRow {
        expires_at: number | null;
      }

      const result = await new Promise<number>((resolve, reject) => {
        this.db.get<ExpiryRow>(
          `SELECT expires_at FROM ${this.tableName} WHERE key = ?`,
          [key],
          (err: Error | null, row: ExpiryRow | undefined) => {
            if (err) reject(err);
            else {
              if (!row || row.expires_at === null) {
                resolve(-1); // 永不过期
              } else {
                const ttl = row.expires_at - Date.now();
                resolve(ttl > 0 ? ttl : 0);
              }
            }
          }
        );
      });

      return { success: true, data: result };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to get TTL for key ${key}: ${err.message}`),
      };
    }
  }

  async expire(key: string, ttl: number): Promise<CacheResult<boolean>> {
    try {
      const expiresAt = Date.now() + ttl;
      const result = await new Promise<boolean>((resolve, reject) => {
        this.db.run(
          `UPDATE ${this.tableName} SET expires_at = ? WHERE key = ?`,
          [expiresAt, key],
          function(this: { changes: number }, err: Error | null) {
            if (err) reject(err);
            else resolve(this.changes > 0);
          }
        );
      });

      return { success: true, data: result };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: new Error(`Failed to set expiration for key ${key}: ${err.message}`),
      };
    }
  }
}
