import { z } from 'zod';

/**
 * 数据库操作结果接口
 */
export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * 数据库查询选项
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
}

/**
 * 数据库适配器配置
 */
export interface DatabaseConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database: string;
  schema?: z.ZodSchema;
}

/**
 * 数据库适配器接口
 */
export abstract class DatabaseAdapter {
  protected config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * 初始化数据库连接
   */
  abstract connect(): Promise<DatabaseResult<void>>;

  /**
   * 关闭数据库连接
   */
  abstract disconnect(): Promise<DatabaseResult<void>>;

  /**
   * 创建记录
   */
  abstract create<T extends object>(collection: string, data: T): Promise<DatabaseResult<T>>;

  /**
   * 查找单条记录
   */
  abstract findOne<T extends object>(collection: string, query: Partial<T>): Promise<DatabaseResult<T>>;

  /**
   * 查找多条记录
   */
  abstract find<T extends object>(
    collection: string,
    query: Partial<T>,
    options?: QueryOptions
  ): Promise<DatabaseResult<T[]>>;

  /**
   * 更新记录
   */
  abstract update<T extends object>(
    collection: string,
    query: Partial<T>,
    data: Partial<T>
  ): Promise<DatabaseResult<T>>;

  /**
   * 删除记录
   */
  abstract delete<T extends object>(collection: string, query: Partial<T>): Promise<DatabaseResult<boolean>>;

  /**
   * 批量操作
   */
  abstract batch<T extends object>(
    collection: string,
    operations: Array<{
      type: 'create' | 'update' | 'delete';
      data: T;
      query?: Partial<T>;
    }>
  ): Promise<DatabaseResult<T[]>>;

  /**
   * 执行原生查询
   */
  abstract query<T>(query: string, params?: unknown[]): Promise<DatabaseResult<T[]>>;
}
