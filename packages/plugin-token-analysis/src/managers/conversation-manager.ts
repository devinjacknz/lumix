import { BaseMemory } from "langchain/memory";
import { Document } from "langchain/document";
import { LumixVectorStore } from "../storage/vector-store";
import { logger } from "@lumix/core";

export interface ConversationConfig {
  maxHistory: number;
  contextWindow: number;
  memoryType: "buffer" | "vector" | "summary";
  cacheEnabled: boolean;
  cacheTTL: number;
  multiModal: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string | {
    type: string;
    data: any;
  };
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  context?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export class ConversationManager {
  private config: ConversationConfig;
  private memory: BaseMemory;
  private vectorStore: LumixVectorStore;
  private conversations: Map<string, Conversation>;
  private cache: Map<string, {
    data: any;
    timestamp: number;
  }>;

  constructor(
    memory: BaseMemory,
    vectorStore: LumixVectorStore,
    config: ConversationConfig
  ) {
    this.config = {
      maxHistory: 100,
      contextWindow: 2048,
      memoryType: "buffer",
      cacheEnabled: true,
      cacheTTL: 3600000, // 1小时
      multiModal: false,
      ...config
    };
    this.memory = memory;
    this.vectorStore = vectorStore;
    this.conversations = new Map();
    this.cache = new Map();
  }

  async createConversation(
    title: string,
    context?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<Conversation> {
    try {
      const conversation: Conversation = {
        id: this.generateId(),
        title,
        messages: [],
        context,
        metadata,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      this.conversations.set(conversation.id, conversation);

      logger.info(
        "Conversation Manager",
        `Created conversation: ${conversation.id}`
      );

      return conversation;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Conversation Manager",
          `Failed to create conversation: ${error.message}`
        );
      }
      throw error;
    }
  }

  async addMessage(
    conversationId: string,
    message: Omit<Message, "id" | "timestamp">
  ): Promise<Message> {
    try {
      const conversation = this.getConversation(conversationId);
      
      const newMessage: Message = {
        id: this.generateId(),
        ...message,
        timestamp: Date.now()
      };

      // 添加消息
      conversation.messages.push(newMessage);
      conversation.updatedAt = Date.now();

      // 限制历史记录长度
      if (conversation.messages.length > this.config.maxHistory) {
        conversation.messages = conversation.messages.slice(
          conversation.messages.length - this.config.maxHistory
        );
      }

      // 更新内存
      await this.updateMemory(conversation);

      logger.info(
        "Conversation Manager",
        `Added message to conversation ${conversationId}`
      );

      return newMessage;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Conversation Manager",
          `Failed to add message: ${error.message}`
        );
      }
      throw error;
    }
  }

  async getContext(
    conversationId: string,
    options?: {
      maxTokens?: number;
      recentMessagesCount?: number;
    }
  ): Promise<{
    messages: Message[];
    context?: Record<string, any>;
  }> {
    try {
      const conversation = this.getConversation(conversationId);

      // 获取最近消息
      const recentMessages = conversation.messages.slice(
        -(options?.recentMessagesCount || this.config.maxHistory)
      );

      // 获取相关上下文
      const context = await this.getRelevantContext(
        conversation,
        options?.maxTokens || this.config.contextWindow
      );

      return {
        messages: recentMessages,
        context
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Conversation Manager",
          `Failed to get context: ${error.message}`
        );
      }
      throw error;
    }
  }

  async updateContext(
    conversationId: string,
    context: Record<string, any>
  ): Promise<void> {
    try {
      const conversation = this.getConversation(conversationId);
      
      conversation.context = {
        ...conversation.context,
        ...context
      };
      conversation.updatedAt = Date.now();

      // 更新内存
      await this.updateMemory(conversation);

      logger.info(
        "Conversation Manager",
        `Updated context for conversation ${conversationId}`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Conversation Manager",
          `Failed to update context: ${error.message}`
        );
      }
      throw error;
    }
  }

  async searchConversations(
    query: string,
    options?: {
      limit?: number;
      filter?: Record<string, any>;
    }
  ): Promise<Conversation[]> {
    try {
      // 将对话转换为文档
      const documents = Array.from(this.conversations.values()).map(
        conversation => new Document({
          pageContent: this.conversationToText(conversation),
          metadata: {
            conversationId: conversation.id,
            title: conversation.title,
            ...conversation.metadata
          }
        })
      );

      // 搜索相关文档
      const results = await this.vectorStore.similaritySearch(
        query,
        options?.limit || 5
      );

      // 获取对应的对话
      return results
        .map(result => this.conversations.get(
          result.metadata.conversationId
        ))
        .filter(Boolean);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Conversation Manager",
          `Failed to search conversations: ${error.message}`
        );
      }
      throw error;
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    try {
      const conversation = this.getConversation(conversationId);
      
      // 清理内存
      await this.memory.clear();
      
      // 删除对话
      this.conversations.delete(conversationId);

      logger.info(
        "Conversation Manager",
        `Deleted conversation ${conversationId}`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Conversation Manager",
          `Failed to delete conversation: ${error.message}`
        );
      }
      throw error;
    }
  }

  private getConversation(id: string): Conversation {
    const conversation = this.conversations.get(id);
    if (!conversation) {
      throw new Error(`Conversation not found: ${id}`);
    }
    return conversation;
  }

  private async updateMemory(conversation: Conversation): Promise<void> {
    try {
      switch (this.config.memoryType) {
        case "buffer":
          await this.updateBufferMemory(conversation);
          break;
        case "vector":
          await this.updateVectorMemory(conversation);
          break;
        case "summary":
          await this.updateSummaryMemory(conversation);
          break;
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Conversation Manager",
          `Failed to update memory: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async updateBufferMemory(conversation: Conversation): Promise<void> {
    // TODO: 实现缓冲区内存更新逻辑
  }

  private async updateVectorMemory(conversation: Conversation): Promise<void> {
    // TODO: 实现向量内存更新逻辑
  }

  private async updateSummaryMemory(conversation: Conversation): Promise<void> {
    // TODO: 实现摘要内存更新逻辑
  }

  private async getRelevantContext(
    conversation: Conversation,
    maxTokens: number
  ): Promise<Record<string, any>> {
    try {
      // 检查缓存
      const cacheKey = `context:${conversation.id}`;
      const cached = this.checkCache(cacheKey);
      if (cached) {
        return cached;
      }

      // 获取相关上下文
      const context = {
        ...conversation.context,
        // TODO: 添加其他相关上下文
      };

      // 缓存结果
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, {
          data: context,
          timestamp: Date.now()
        });
      }

      return context;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Conversation Manager",
          `Failed to get relevant context: ${error.message}`
        );
      }
      throw error;
    }
  }

  private conversationToText(conversation: Conversation): string {
    return [
      `Title: ${conversation.title}`,
      ...conversation.messages.map(msg =>
        `${msg.role}: ${
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content)
        }`
      )
    ].join("\n");
  }

  private checkCache(key: string): any {
    if (!this.config.cacheEnabled) {
      return null;
    }

    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  public getConversationCount(): number {
    return this.conversations.size;
  }

  public getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public updateConfig(config: Partial<ConversationConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 