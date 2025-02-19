import { Database } from 'sqlite3';
import { DatabaseAdapter, DatabaseConfig } from '@lumix/types';
export interface SQLiteConfig extends DatabaseConfig {
    type: 'sqlite';
    path: string;
    mode?: number;
    verbose?: boolean;
}
export declare class SQLiteError extends Error {
    code: string;
    cause?: Error | undefined;
    constructor(message: string, code: string, cause?: Error | undefined);
}
/**
 * 基础SQLite适配器
 * 提供底层数据库操作
 */
export declare class BaseSQLiteAdapter implements DatabaseAdapter {
    protected db: Database | null;
    protected config: SQLiteConfig;
    private preparedStatements;
    constructor(config: SQLiteConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    /**
     * 执行SQL查询并返回所有结果
     */
    query<T>(sql: string, params?: any[]): Promise<T>;
    /**
     * 执行SQL查询并返回单个结果
     */
    queryOne<T>(sql: string, params?: any[]): Promise<T | null>;
    /**
     * 执行SQL更新
     */
    execute(sql: string, params?: any[]): Promise<number>;
    /**
     * 执行批量操作
     */
    batch(operations: Array<{
        sql: string;
        params: any[];
    }>): Promise<void>;
    /**
     * 开始事务
     */
    beginTransaction(): Promise<void>;
    /**
     * 提交事务
     */
    commit(): Promise<void>;
    /**
     * 回滚事务
     */
    rollback(): Promise<void>;
    /**
     * 获取预处理语句
     */
    private prepare;
    /**
     * 优化数据库
     */
    optimize(): Promise<void>;
    /**
     * 创建索引
     */
    createIndex(table: string, columns: string[], unique?: boolean): Promise<void>;
    /**
     * 删除索引
     */
    dropIndex(indexName: string): Promise<void>;
    /**
     * 获取表信息
     */
    getTableInfo(table: string): Promise<any[]>;
    /**
     * 获取索引信息
     */
    getIndexInfo(table: string): Promise<any[]>;
}
