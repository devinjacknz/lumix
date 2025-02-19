import { Tool } from "langchain/tools";
import { Document } from "langchain/document";
import { Embeddings } from "langchain/embeddings";
import { LumixVectorStore } from "../storage/vector-store";
import { DatabaseManager } from "@lumix/core";
import { logger } from "@lumix/core";

export interface MigrationConfig {
  batchSize: number;
  maxConcurrent: number;
  retryAttempts: number;
  retryDelay: number;
  validateData: boolean;
  backupData: boolean;
  backupPath?: string;
}

export interface MigrationStats {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: string[];
  startTime: number;
  endTime?: number;
}

export interface MigrationTask {
  id: string;
  source: string;
  target: string;
  filter?: Record<string, any>;
  transform?: (data: any) => Promise<Document>;
  validate?: (doc: Document) => Promise<boolean>;
}

export class DataMigratorTool extends Tool {
  private config: MigrationConfig;
  private vectorStore: LumixVectorStore;
  private dbManager: DatabaseManager;
  private stats: Map<string, MigrationStats>;
  private activeTasks: Set<string>;

  constructor(
    vectorStore: LumixVectorStore,
    config: MigrationConfig
  ) {
    super();
    this.config = config;
    this.vectorStore = vectorStore;
    this.dbManager = DatabaseManager.getInstance();
    this.stats = new Map();
    this.activeTasks = new Set();
  }

  name = "data_migrator";
  description = "迁移现有数据到向量存储";

  async _call(input: string): Promise<string> {
    try {
      const request = JSON.parse(input);
      
      switch (request.action) {
        case "start-migration":
          return JSON.stringify(
            await this.startMigration(request.task)
          );
        case "get-status":
          return JSON.stringify(
            this.getMigrationStatus(request.taskId)
          );
        case "stop-migration":
          await this.stopMigration(request.taskId);
          return "success";
        case "validate-migration":
          return JSON.stringify(
            await this.validateMigration(request.taskId)
          );
        default:
          throw new Error(`Unknown action: ${request.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Data Migrator Tool", `Operation failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async startMigration(task: MigrationTask): Promise<{
    taskId: string;
    status: string;
    stats: MigrationStats;
  }> {
    try {
      // 验证任务
      this.validateTask(task);

      // 检查是否已有相同任务在运行
      if (this.activeTasks.has(task.id)) {
        throw new Error(`Migration task ${task.id} is already running`);
      }

      // 初始化统计信息
      const stats: MigrationStats = {
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        startTime: Date.now()
      };
      this.stats.set(task.id, stats);

      // 开始迁移
      this.activeTasks.add(task.id);
      this.processMigration(task).catch(error => {
        if (error instanceof Error) {
          logger.error(
            "Data Migrator Tool",
            `Migration task ${task.id} failed: ${error.message}`
          );
          stats.errors.push(error.message);
        }
        this.activeTasks.delete(task.id);
      });

      return {
        taskId: task.id,
        status: "started",
        stats
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Data Migrator Tool",
          `Failed to start migration: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async processMigration(task: MigrationTask): Promise<void> {
    try {
      // 获取源数据
      const sourceData = await this.getSourceData(task);
      const stats = this.stats.get(task.id);
      stats.total = sourceData.length;

      // 分批处理数据
      for (let i = 0; i < sourceData.length; i += this.config.batchSize) {
        const batch = sourceData.slice(i, i + this.config.batchSize);
        
        // 转换数据
        const documents = await Promise.all(
          batch.map(async data => {
            try {
              const doc = await this.transformData(data, task.transform);
              
              // 验证数据
              if (task.validate) {
                const isValid = await task.validate(doc);
                if (!isValid) {
                  stats.skipped++;
                  return null;
                }
              }

              return doc;
            } catch (error) {
              if (error instanceof Error) {
                stats.failed++;
                stats.errors.push(error.message);
              }
              return null;
            }
          })
        );

        // 过滤掉无效文档
        const validDocuments = documents.filter(doc => doc !== null) as Document[];
        
        // 添加到向量存储
        if (validDocuments.length > 0) {
          await this.vectorStore.addDocuments(validDocuments);
          stats.succeeded += validDocuments.length;
        }

        stats.processed += batch.length;
        this.stats.set(task.id, stats);

        // 检查是否需要停止
        if (!this.activeTasks.has(task.id)) {
          break;
        }
      }

      // 完成迁移
      stats.endTime = Date.now();
      this.activeTasks.delete(task.id);

      logger.info(
        "Data Migrator Tool",
        `Migration task ${task.id} completed: ${stats.succeeded}/${stats.total} documents migrated`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Data Migrator Tool",
          `Migration processing failed: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getSourceData(task: MigrationTask): Promise<any[]> {
    try {
      const db = this.dbManager.getAdapter();
      const collection = await db.getCollection(task.source);
      
      if (task.filter) {
        return await collection.find(task.filter);
      }
      
      return await collection.find({});
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Data Migrator Tool",
          `Failed to get source data: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async transformData(
    data: any,
    transform?: MigrationTask["transform"]
  ): Promise<Document> {
    if (transform) {
      return transform(data);
    }

    // 默认转换
    return new Document({
      pageContent: JSON.stringify(data),
      metadata: {
        source: data._id?.toString(),
        timestamp: data.timestamp || Date.now()
      }
    });
  }

  private validateTask(task: MigrationTask): void {
    if (!task.id) {
      throw new Error("Task ID is required");
    }
    if (!task.source) {
      throw new Error("Source collection is required");
    }
    if (!task.target) {
      throw new Error("Target collection is required");
    }
  }

  private getMigrationStatus(taskId: string): {
    isActive: boolean;
    stats: MigrationStats;
  } {
    return {
      isActive: this.activeTasks.has(taskId),
      stats: this.stats.get(taskId) || {
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        startTime: 0
      }
    };
  }

  private async stopMigration(taskId: string): Promise<void> {
    if (this.activeTasks.has(taskId)) {
      this.activeTasks.delete(taskId);
      const stats = this.stats.get(taskId);
      if (stats) {
        stats.endTime = Date.now();
      }
      
      logger.info(
        "Data Migrator Tool",
        `Migration task ${taskId} stopped`
      );
    }
  }

  private async validateMigration(taskId: string): Promise<{
    isValid: boolean;
    errors: string[];
    details: {
      sourceCount: number;
      targetCount: number;
      missingDocuments: string[];
      invalidDocuments: string[];
    };
  }> {
    try {
      const stats = this.stats.get(taskId);
      if (!stats) {
        throw new Error(`Migration task ${taskId} not found`);
      }

      // TODO: 实现迁移验证逻辑

      return {
        isValid: true,
        errors: [],
        details: {
          sourceCount: 0,
          targetCount: 0,
          missingDocuments: [],
          invalidDocuments: []
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Data Migrator Tool",
          `Migration validation failed: ${error.message}`
        );
      }
      throw error;
    }
  }

  public getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  public getAllStats(): Map<string, MigrationStats> {
    return new Map(this.stats);
  }

  public clearStats(taskId?: string): void {
    if (taskId) {
      this.stats.delete(taskId);
    } else {
      this.stats.clear();
    }
  }
} 