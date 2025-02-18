import { z } from "zod";

/**
 * 数据库迁移配置
 */
export const MigrationConfigSchema = z.object({
  /**
   * 迁移版本号
   */
  version: z.number(),

  /**
   * 迁移名称
   */
  name: z.string(),

  /**
   * 迁移描述
   */
  description: z.string().optional(),

  /**
   * 迁移SQL语句
   */
  sql: z.string(),
});

export type MigrationConfig = z.infer<typeof MigrationConfigSchema>;

/**
 * 数据库迁移记录
 */
export const MigrationRecordSchema = z.object({
  /**
   * 迁移版本号
   */
  version: z.number(),

  /**
   * 迁移名称
   */
  name: z.string(),

  /**
   * 迁移时间
   */
  migratedAt: z.date(),

  /**
   * 迁移状态
   */
  status: z.enum(["success", "failed"]),

  /**
   * 错误信息
   */
  error: z.string().optional(),
});

export type MigrationRecord = z.infer<typeof MigrationRecordSchema>;

/**
 * 数据库迁移接口
 */
export interface IMigrationManager {
  /**
   * 获取当前数据库版本
   */
  getCurrentVersion(): Promise<number>;

  /**
   * 获取迁移记录
   */
  getMigrationRecords(): Promise<MigrationRecord[]>;

  /**
   * 执行迁移
   * @param migrations 迁移配置列表
   */
  migrate(migrations: MigrationConfig[]): Promise<void>;

  /**
   * 回滚到指定版本
   * @param version 目标版本号
   */
  rollback(version: number): Promise<void>;
}

/**
 * 持久化存储接口
 */
export interface IPersistenceAdapter {
  /**
   * 初始化存储
   */
  initialize(): Promise<void>;

  /**
   * 关闭存储连接
   */
  close(): Promise<void>;

  /**
   * 执行SQL查询
   * @param sql SQL语句
   * @param params 查询参数
   */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;

  /**
   * 执行SQL更新
   * @param sql SQL语句
   * @param params 更新参数
   */
  execute(sql: string, params?: any[]): Promise<void>;

  /**
   * 开启事务
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
   * 获取迁移管理器
   */
  getMigrationManager(): IMigrationManager;

  store(key: string, value: any): Promise<void>;
  retrieve(key: string): Promise<any>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface PersistenceOptions {
  path?: string;
  maxSize?: number;
  ttl?: number;
}
