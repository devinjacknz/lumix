import { Document } from "langchain/document";
import { TextSplitter } from "langchain/text_splitter";
import { Embeddings } from "langchain/embeddings";
import { logger } from "@lumix/core";

export interface ProcessorConfig {
  pipeline: Array<{
    name: string;
    type: "transform" | "filter" | "enrich";
    config?: Record<string, any>;
  }>;
  batchSize?: number;
  maxConcurrent?: number;
  embeddings?: Embeddings;
  metadata?: Record<string, any>;
}

export interface ProcessingStats {
  inputDocs: number;
  outputDocs: number;
  transformedDocs: number;
  filteredDocs: number;
  enrichedDocs: number;
  errors: string[];
  startTime: number;
  endTime?: number;
}

export class DocumentProcessor {
  private config: ProcessorConfig;
  private textSplitter: TextSplitter;
  private stats: ProcessingStats;
  private transformers: Map<string, (doc: Document) => Promise<Document>>;
  private filters: Map<string, (doc: Document) => Promise<boolean>>;
  private enrichers: Map<string, (doc: Document) => Promise<Document>>;

  constructor(config: ProcessorConfig) {
    this.config = {
      pipeline: [],
      batchSize: 100,
      maxConcurrent: 5,
      ...config
    };
    this.stats = this.initializeStats();
    this.initializePipeline();
  }

  private initializePipeline(): void {
    this.transformers = new Map();
    this.filters = new Map();
    this.enrichers = new Map();

    // 注册默认处理器
    this.registerTransformers();
    this.registerFilters();
    this.registerEnrichers();
  }

  private registerTransformers(): void {
    // 文本清理
    this.transformers.set("clean_text", async (doc: Document) => {
      const cleaned = await this.cleanText(doc.pageContent);
      return new Document({
        pageContent: cleaned,
        metadata: doc.metadata
      });
    });

    // 文本规范化
    this.transformers.set("normalize_text", async (doc: Document) => {
      const normalized = await this.normalizeText(doc.pageContent);
      return new Document({
        pageContent: normalized,
        metadata: doc.metadata
      });
    });

    // 文本去重
    this.transformers.set("deduplicate", async (doc: Document) => {
      const deduplicated = await this.deduplicateText(doc.pageContent);
      return new Document({
        pageContent: deduplicated,
        metadata: doc.metadata
      });
    });
  }

  private registerFilters(): void {
    // 长度过滤
    this.filters.set("length", async (doc: Document) => {
      const minLength = this.config.pipeline.find(
        p => p.name === "length"
      )?.config?.minLength || 0;
      return doc.pageContent.length >= minLength;
    });

    // 语言过滤
    this.filters.set("language", async (doc: Document) => {
      const allowedLanguages = this.config.pipeline.find(
        p => p.name === "language"
      )?.config?.languages || ["en"];
      const language = await this.detectLanguage(doc.pageContent);
      return allowedLanguages.includes(language);
    });

    // 质量过滤
    this.filters.set("quality", async (doc: Document) => {
      const minQuality = this.config.pipeline.find(
        p => p.name === "quality"
      )?.config?.minQuality || 0.5;
      const quality = await this.assessQuality(doc.pageContent);
      return quality >= minQuality;
    });
  }

  private registerEnrichers(): void {
    // 添加嵌入
    this.enrichers.set("embeddings", async (doc: Document) => {
      if (!this.config.embeddings) {
        return doc;
      }
      const embedding = await this.config.embeddings.embedQuery(
        doc.pageContent
      );
      return new Document({
        pageContent: doc.pageContent,
        metadata: {
          ...doc.metadata,
          embedding
        }
      });
    });

    // 添加摘要
    this.enrichers.set("summary", async (doc: Document) => {
      const summary = await this.generateSummary(doc.pageContent);
      return new Document({
        pageContent: doc.pageContent,
        metadata: {
          ...doc.metadata,
          summary
        }
      });
    });

    // 添加关键词
    this.enrichers.set("keywords", async (doc: Document) => {
      const keywords = await this.extractKeywords(doc.pageContent);
      return new Document({
        pageContent: doc.pageContent,
        metadata: {
          ...doc.metadata,
          keywords
        }
      });
    });
  }

  async process(documents: Document[]): Promise<Document[]> {
    try {
      // 重置统计信息
      this.stats = this.initializeStats();
      this.stats.inputDocs = documents.length;
      this.stats.startTime = Date.now();

      // 处理文档
      let processedDocs = [...documents];

      // 按批次处理
      for (let i = 0; i < processedDocs.length; i += this.config.batchSize) {
        const batch = processedDocs.slice(i, i + this.config.batchSize);
        const batchResults = await Promise.all(
          batch.map(doc => this.processDocument(doc))
        );
        processedDocs.splice(i, batch.length, ...batchResults.filter(Boolean));
      }

      // 更新统计信息
      this.stats.outputDocs = processedDocs.length;
      this.stats.endTime = Date.now();

      logger.info(
        "Document Processor",
        `Processed ${this.stats.inputDocs} documents, output ${this.stats.outputDocs} documents`
      );

      return processedDocs;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Document Processor",
          `Processing failed: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async processDocument(doc: Document): Promise<Document | null> {
    try {
      let processedDoc = doc;

      // 执行管道处理
      for (const step of this.config.pipeline) {
        switch (step.type) {
          case "transform":
            const transformer = this.transformers.get(step.name);
            if (transformer) {
              processedDoc = await transformer(processedDoc);
              this.stats.transformedDocs++;
            }
            break;

          case "filter":
            const filter = this.filters.get(step.name);
            if (filter) {
              const shouldKeep = await filter(processedDoc);
              if (!shouldKeep) {
                this.stats.filteredDocs++;
                return null;
              }
            }
            break;

          case "enrich":
            const enricher = this.enrichers.get(step.name);
            if (enricher) {
              processedDoc = await enricher(processedDoc);
              this.stats.enrichedDocs++;
            }
            break;
        }
      }

      return processedDoc;
    } catch (error) {
      if (error instanceof Error) {
        this.stats.errors.push(error.message);
        logger.error(
          "Document Processor",
          `Failed to process document: ${error.message}`
        );
      }
      return null;
    }
  }

  private async cleanText(text: string): Promise<string> {
    // 移除多余空白
    text = text.replace(/\s+/g, " ").trim();
    
    // 移除特殊字符
    text = text.replace(/[^\w\s.,!?-]/g, "");
    
    // 修复标点符号
    text = text.replace(/\s+([.,!?])/g, "$1");
    
    return text;
  }

  private async normalizeText(text: string): Promise<string> {
    // 转换为小写
    text = text.toLowerCase();
    
    // 规范化空白
    text = text.replace(/\s+/g, " ");
    
    // 规范化标点
    text = text.replace(/[""]/g, '"')
               .replace(/['']/g, "'");
    
    return text;
  }

  private async deduplicateText(text: string): Promise<string> {
    // 分割为句子
    const sentences = text.split(/[.!?]+/);
    
    // 去重
    const unique = Array.from(new Set(sentences));
    
    // 重新组合
    return unique.join(". ").trim();
  }

  private async detectLanguage(text: string): Promise<string> {
    // TODO: 实现语言检测逻辑
    return "en";
  }

  private async assessQuality(text: string): Promise<number> {
    // TODO: 实现质量评估逻辑
    return 1;
  }

  private async generateSummary(text: string): Promise<string> {
    // TODO: 实现摘要生成逻辑
    return "";
  }

  private async extractKeywords(text: string): Promise<string[]> {
    // TODO: 实现关键词提取逻辑
    return [];
  }

  private initializeStats(): ProcessingStats {
    return {
      inputDocs: 0,
      outputDocs: 0,
      transformedDocs: 0,
      filteredDocs: 0,
      enrichedDocs: 0,
      errors: [],
      startTime: 0
    };
  }

  public getStats(): ProcessingStats {
    return { ...this.stats };
  }

  public getPipelineSteps(): string[] {
    return this.config.pipeline.map(step => step.name);
  }

  public updateConfig(config: Partial<ProcessorConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 