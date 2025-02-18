import { 
  BaseMemory,
  BufferMemory,
  ChatMessageHistory,
  VectorStoreRetrieverMemory
} from "langchain/memory";
import { HumanMessage, AIMessage, SystemMessage } from "langchain/schema";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Document } from "langchain/document";
import { logger } from '../monitoring';

export interface MemoryConfig {
  maxTokens?: number;
  returnMessages?: boolean;
  memoryKey?: string;
  inputKey?: string;
  outputKey?: string;
  humanPrefix?: string;
  aiPrefix?: string;
  vectorStorePath?: string;
}

export class MemoryManager {
  private static instance: MemoryManager;
  private memories: Map<string, BaseMemory>;
  private messageHistories: Map<string, ChatMessageHistory>;
  private vectorStores: Map<string, MemoryVectorStore>;
  private embeddings: OpenAIEmbeddings;

  private constructor() {
    this.memories = new Map();
    this.messageHistories = new Map();
    this.vectorStores = new Map();
  }

  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  public async initialize(config: { openAIApiKey: string }): Promise<void> {
    try {
      // 初始化嵌入模型
      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey: config.openAIApiKey
      });
      logger.info('Memory', 'Memory manager initialized');
    } catch (error) {
      logger.error('Memory', 'Failed to initialize memory manager', error);
      throw error;
    }
  }

  public createBufferMemory(sessionId: string, config?: MemoryConfig): BufferMemory {
    try {
      const messageHistory = new ChatMessageHistory();
      this.messageHistories.set(sessionId, messageHistory);

      const memory = new BufferMemory({
        chatHistory: messageHistory,
        returnMessages: config?.returnMessages ?? true,
        memoryKey: config?.memoryKey ?? 'history',
        inputKey: config?.inputKey ?? 'input',
        outputKey: config?.outputKey ?? 'output',
        humanPrefix: config?.humanPrefix ?? 'Human',
        aiPrefix: config?.aiPrefix ?? 'Assistant'
      });

      this.memories.set(sessionId, memory);
      logger.info('Memory', `Created buffer memory for session ${sessionId}`);
      return memory;
    } catch (error) {
      logger.error('Memory', `Failed to create buffer memory for session ${sessionId}`, error);
      throw error;
    }
  }

  public async createVectorMemory(sessionId: string, config?: MemoryConfig): Promise<VectorStoreRetrieverMemory> {
    try {
      // 创建向量存储
      const vectorStore = new MemoryVectorStore(this.embeddings);
      this.vectorStores.set(sessionId, vectorStore);

      // 创建向量存储记忆
      const memory = new VectorStoreRetrieverMemory({
        vectorStoreRetriever: vectorStore.asRetriever(),
        memoryKey: config?.memoryKey ?? 'history',
        inputKey: config?.inputKey ?? 'input',
        outputKey: config?.outputKey ?? 'output',
        returnDocs: true
      });

      this.memories.set(sessionId, memory);
      logger.info('Memory', `Created vector memory for session ${sessionId}`);
      return memory;
    } catch (error) {
      logger.error('Memory', `Failed to create vector memory for session ${sessionId}`, error);
      throw error;
    }
  }

  public async addMessage(
    sessionId: string, 
    message: { role: string; content: string }
  ): Promise<void> {
    try {
      const messageHistory = this.messageHistories.get(sessionId);
      if (!messageHistory) {
        throw new Error(`No message history found for session ${sessionId}`);
      }

      switch (message.role) {
        case 'human':
          await messageHistory.addMessage(new HumanMessage(message.content));
          break;
        case 'ai':
          await messageHistory.addMessage(new AIMessage(message.content));
          break;
        case 'system':
          await messageHistory.addMessage(new SystemMessage(message.content));
          break;
        default:
          throw new Error(`Unknown message role: ${message.role}`);
      }

      // 如果存在向量存储，也添加到向量存储中
      const vectorStore = this.vectorStores.get(sessionId);
      if (vectorStore) {
        await vectorStore.addDocuments([
          new Document({
            pageContent: message.content,
            metadata: {
              role: message.role,
              timestamp: Date.now()
            }
          })
        ]);
      }

      logger.debug('Memory', `Added ${message.role} message to session ${sessionId}`);
    } catch (error) {
      logger.error('Memory', `Failed to add message to session ${sessionId}`, error);
      throw error;
    }
  }

  public async getMessages(sessionId: string): Promise<any[]> {
    try {
      const messageHistory = this.messageHistories.get(sessionId);
      if (!messageHistory) {
        throw new Error(`No message history found for session ${sessionId}`);
      }

      return await messageHistory.getMessages();
    } catch (error) {
      logger.error('Memory', `Failed to get messages for session ${sessionId}`, error);
      throw error;
    }
  }

  public async searchMemory(
    sessionId: string,
    query: string,
    limit: number = 5
  ): Promise<Document[]> {
    try {
      const vectorStore = this.vectorStores.get(sessionId);
      if (!vectorStore) {
        throw new Error(`No vector store found for session ${sessionId}`);
      }

      const results = await vectorStore.similaritySearch(query, limit);
      logger.debug('Memory', `Found ${results.length} similar documents for query in session ${sessionId}`);
      return results;
    } catch (error) {
      logger.error('Memory', `Failed to search memory for session ${sessionId}`, error);
      throw error;
    }
  }

  public async clearMemory(sessionId: string): Promise<void> {
    try {
      // 清理消息历史
      const messageHistory = this.messageHistories.get(sessionId);
      if (messageHistory) {
        await messageHistory.clear();
        this.messageHistories.delete(sessionId);
      }

      // 清理向量存储
      this.vectorStores.delete(sessionId);

      // 清理内存组件
      this.memories.delete(sessionId);

      logger.info('Memory', `Cleared memory for session ${sessionId}`);
    } catch (error) {
      logger.error('Memory', `Failed to clear memory for session ${sessionId}`, error);
      throw error;
    }
  }

  public async clearAllMemories(): Promise<void> {
    try {
      const sessions = Array.from(this.memories.keys());
      await Promise.all(sessions.map(sessionId => this.clearMemory(sessionId)));
      logger.info('Memory', 'Cleared all memories');
    } catch (error) {
      logger.error('Memory', 'Failed to clear all memories', error);
      throw error;
    }
  }

  public getMemory(sessionId: string): BaseMemory | undefined {
    return this.memories.get(sessionId);
  }

  public listSessions(): string[] {
    return Array.from(this.memories.keys());
  }
} 