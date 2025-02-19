import { MigrationConfig, MigrationRecord, IMigrationManager } from "./types";

/**
 * 基础迁移管理器实现
 */
export abstract class BaseMigrationManager implements IMigrationManager {
  /**
   * 获取当前数据库版本
   */
  abstract getCurrentVersion(): Promise<number>;

  /**
   * 获取迁移记录
   */
  abstract getMigrationRecords(): Promise<MigrationRecord[]>;

  /**
   * 执行迁移
   * @param migrations 迁移配置列表
   */
  async migrate(migrations: MigrationConfig[]): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    
    // 按版本号排序
    const sortedMigrations = migrations
      .filter(m => m.version > currentVersion)
      .sort((a, b) => a.version - b.version);

    for (const migration of sortedMigrations) {
      try {
        await this.executeMigration(migration);
        await this.saveMigrationRecord({
          version: migration.version,
          name: migration.name,
          migratedAt: new Date(),
          status: "success"
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.saveMigrationRecord({
          version: migration.version,
          name: migration.name,
          migratedAt: new Date(),
          status: "failed",
          error: errorMessage
        });
        throw error;
      }
    }
  }

  /**
   * 回滚到指定版本
   * @param version 目标版本号
   */
  async rollback(version: number): Promise<void> {
    const records = await this.getMigrationRecords();
    
    // 按版本号倒序排序
    const rollbackRecords = records
      .filter(r => r.version > version && r.status === "success")
      .sort((a, b) => b.version - a.version);

    for (const record of rollbackRecords) {
      try {
        await this.executeRollback(record.version);
        await this.saveMigrationRecord({
          version: record.version,
          name: `Rollback of ${record.name}`,
          migratedAt: new Date(),
          status: "success"
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.saveMigrationRecord({
          version: record.version,
          name: `Rollback of ${record.name}`,
          migratedAt: new Date(),
          status: "failed",
          error: errorMessage
        });
        throw error;
      }
    }
  }

  /**
   * 执行迁移
   * @param migration 迁移配置
   */
  protected abstract executeMigration(migration: MigrationConfig): Promise<void>;

  /**
   * 执行回滚
   * @param version 版本号
   */
  protected abstract executeRollback(version: number): Promise<void>;

  /**
   * 保存迁移记录
   * @param record 迁移记录
   */
  protected abstract saveMigrationRecord(record: MigrationRecord): Promise<void>;
}
