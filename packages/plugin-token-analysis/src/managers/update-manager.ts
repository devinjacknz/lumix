import { Document } from "langchain/document";
import { LumixVectorStore } from "../storage/vector-store";
import { DocumentProcessor } from "../processors/document-processor";
import { logger } from "@lumix/core";

export interface UpdateConfig {
  batchSize: number;
  maxConcurrent: number;
  retryAttempts: number;
  retryDelay: number;
  validateUpdates: boolean;
  backupBeforeUpdate: boolean;
  versionControl: boolean;
}

export interface UpdateStats {
  totalDocs: number;
  updatedDocs: number;
  failedDocs: number;
  skippedDocs: number;
  errors: string[];
  startTime: number;
  endTime?: number;
}

export interface UpdateTask {
  id: string;
  documents: Document[];
  type: "create" | "update" | "delete";
  filter?: Record<string, any>;
  metadata?: Record<string, any>;
}

export class UpdateManager {
  private config: UpdateConfig;
  private vectorStore: LumixVectorStore;
  private processor: DocumentProcessor;
  private stats: Map<string, UpdateStats>;
  private activeTasks: Set<string>;
  private versions: Map<string, number>;

  constructor(
    vectorStore: LumixVectorStore,
    processor: DocumentProcessor,
    config: UpdateConfig
  ) {
    this.config = {
      batchSize: 100,
      maxConcurrent: 5,
      retryAttempts: 3,
      retryDelay: 1000,
      validateUpdates: true,
      backupBeforeUpdate: true,
      versionControl: true,
      ...config
    };
    this.vectorStore = vectorStore;
    this.processor = processor;
    this.stats = new Map();
    this.activeTasks = new Set();
    this.versions = new Map();
  }

  async update(task: UpdateTask): Promise<{
    taskId: string;
    status: string;
    stats: UpdateStats;
  }> {
    try {
      // 验证任务
      this.validateTask(task);

      // 检查是否已有相同任务在运行
      if (this.activeTasks.has(task.id)) {
        throw new Error(`Update task ${task.id} is already running`);
      }

      // 初始化统计信息
      const stats: UpdateStats = {
        totalDocs: task.documents.length,
        updatedDocs: 0,
        failedDocs: 0,
        skippedDocs: 0,
        errors: [],
        startTime: Date.now()
      };
      this.stats.set(task.id, stats);

      // 开始更新
      this.activeTasks.add(task.id);
      this.processUpdate(task).catch(error => {
        if (error instanceof Error) {
          logger.error(
            "Update Manager",
            `Update task ${task.id} failed: ${error.message}`
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
          "Update Manager",
          `Failed to start update: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async processUpdate(task: UpdateTask): Promise<void> {
    try {
      const stats = this.stats.get(task.id);

      // 备份(如果启用)
      if (this.config.backupBeforeUpdate) {
        await this.backupDocuments(task.documents);
      }

      // 处理文档
      let processedDocs = [...task.documents];
      if (task.type !== "delete") {
        processedDocs = await this.processor.process(processedDocs);
      }

      // 按批次更新
      for (let i = 0; i < processedDocs.length; i += this.config.batchSize) {
        const batch = processedDocs.slice(i, i + this.config.batchSize);
        
        try {
          switch (task.type) {
            case "create":
              await this.createDocuments(batch, task.metadata);
              break;
            case "update":
              await this.updateDocuments(batch, task.metadata);
              break;
            case "delete":
              await this.deleteDocuments(batch);
              break;
          }
          
          stats.updatedDocs += batch.length;
        } catch (error) {
          if (error instanceof Error) {
            stats.failedDocs += batch.length;
            stats.errors.push(error.message);
            logger.error(
              "Update Manager",
              `Batch update failed: ${error.message}`
            );
          }
        }

        // 检查是否需要停止
        if (!this.activeTasks.has(task.id)) {
          break;
        }
      }

      // 完成更新
      stats.endTime = Date.now();
      this.activeTasks.delete(task.id);

      logger.info(
        "Update Manager",
        `Update task ${task.id} completed: ${stats.updatedDocs}/${stats.totalDocs} documents updated`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Update Manager",
          `Update processing failed: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async createDocuments(
    documents: Document[],
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // 添加版本信息
      if (this.config.versionControl) {
        documents = documents.map(doc => {
          const id = doc.metadata.id || doc.metadata.source;
          const version = this.getNextVersion(id);
          return new Document({
            pageContent: doc.pageContent,
            metadata: {
              ...doc.metadata,
              ...metadata,
              version
            }
          });
        });
      }

      // 添加到向量存储
      await this.vectorStore.addDocuments(documents);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Update Manager",
          `Failed to create documents: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async updateDocuments(
    documents: Document[],
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // 更新版本信息
      if (this.config.versionControl) {
        documents = documents.map(doc => {
          const id = doc.metadata.id || doc.metadata.source;
          const version = this.getNextVersion(id);
          return new Document({
            pageContent: doc.pageContent,
            metadata: {
              ...doc.metadata,
              ...metadata,
              version
            }
          });
        });
      }

      // 删除旧文档
      const ids = documents.map(doc => 
        doc.metadata.id || doc.metadata.source
      );
      await this.vectorStore.delete(ids);

      // 添加新文档
      await this.vectorStore.addDocuments(documents);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Update Manager",
          `Failed to update documents: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async deleteDocuments(documents: Document[]): Promise<void> {
    try {
      const ids = documents.map(doc => 
        doc.metadata.id || doc.metadata.source
      );
      await this.vectorStore.delete(ids);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Update Manager",
          `Failed to delete documents: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async backupDocuments(documents: Document[]): Promise<void> {
    try {
      // TODO: 实现文档备份逻辑
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Update Manager",
          `Failed to backup documents: ${error.message}`
        );
      }
      throw error;
    }
  }

  private validateTask(task: UpdateTask): void {
    if (!task.id) {
      throw new Error("Task ID is required");
    }
    if (!task.documents || !task.documents.length) {
      throw new Error("Documents are required");
    }
    if (!task.type) {
      throw new Error("Task type is required");
    }
  }

  private getNextVersion(id: string): number {
    const currentVersion = this.versions.get(id) || 0;
    const nextVersion = currentVersion + 1;
    this.versions.set(id, nextVersion);
    return nextVersion;
  }

  public getUpdateStatus(taskId: string): {
    isActive: boolean;
    stats: UpdateStats;
  } {
    return {
      isActive: this.activeTasks.has(taskId),
      stats: this.stats.get(taskId) || {
        totalDocs: 0,
        updatedDocs: 0,
        failedDocs: 0,
        skippedDocs: 0,
        errors: [],
        startTime: 0
      }
    };
  }

  public stopUpdate(taskId: string): void {
    if (this.activeTasks.has(taskId)) {
      this.activeTasks.delete(taskId);
      const stats = this.stats.get(taskId);
      if (stats) {
        stats.endTime = Date.now();
      }
      
      logger.info(
        "Update Manager",
        `Update task ${taskId} stopped`
      );
    }
  }

  public getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  public getAllStats(): Map<string, UpdateStats> {
    return new Map(this.stats);
  }

  public clearStats(taskId?: string): void {
    if (taskId) {
      this.stats.delete(taskId);
    } else {
      this.stats.clear();
    }
  }

  public updateConfig(config: Partial<UpdateConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 