import { 
  ChatMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage
} from "langchain/schema";
import { BaseChatModel } from "langchain/chat_models/base";
import { LLMChain } from "langchain/chains";
import { PromptTemplate } from "langchain/prompts";
import { 
  CallbackManager,
  Callbacks 
} from "langchain/callbacks";
import { 
  ChatOpenAI
} from "langchain/chat_models/openai";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import {
  ChatAnthropic
} from "langchain/chat_models/anthropic";
import { LLMInterface, LLMResponse, ModelConfig, ModelType, PromptTemplate as PromptType, PromptTemplateParams } from './types';
import { logger } from '../monitoring';
import { PromptManager } from './prompt-manager';
import { MemoryManager, MemoryConfig } from './memory-manager';
import { CacheManager, CacheConfig } from './cache-manager';
import {
  ExtendedBaseChatModel,
  ExtendedBaseMessage,
  ChatMessage as LangChainChatMessage,
  ModelResponse,
  convertToBaseMessage,
  convertFromBaseMessage,
  convertToModelResponse,
  isModelResponse,
  ExtendedMessageContent
} from './langchain-types';
import { StateManager } from './state-manager';
import path from 'path';
import { PluginAdapter, PluginToolConfig } from './plugin-adapter';
import { Plugin } from '../plugin/plugin-manager';
import { ToolManager } from './tool-manager';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { PromptTemplate } from '@langchain/core/prompts';
import { BaseOutputParser } from '@langchain/core/output_parsers';
import { BaseCallbackConfig } from '@langchain/core/callbacks/base';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { z } from 'zod';

export class LangChainAdapter implements LLMInterface {
  private model!: ExtendedBaseChatModel;
  private embeddings!: OpenAIEmbeddings;
  private callbackManager: CallbackManager;
  private config: ModelConfig;
  private promptManager: PromptManager;
  private memoryManager: MemoryManager;
  private cacheManager: CacheManager;
  private stateManager: StateManager;
  private toolManager: ToolManager;
  private pluginAdapter: PluginAdapter;
  private currentSessionId: string = '';

  constructor(config: ModelConfig) {
    this.config = config;
    this.promptManager = PromptManager.getInstance();
    this.memoryManager = MemoryManager.getInstance();
    this.cacheManager = CacheManager.getInstance({
      enabled: true,
      ttl: 3600000, // 1小时
      maxSize: 1000,
      namespace: 'llm'
    });
    this.stateManager = StateManager.getInstance({
      persistPath: config.statePersistPath || path.join(process.cwd(), 'data', 'states', 'llm-states.json'),
      autoSave: true,
      saveInterval: 300000, // 5分钟
      maxStates: 1000
    });
    this.toolManager = ToolManager.getInstance();
    this.pluginAdapter = PluginAdapter.getInstance();
    this.callbackManager = CallbackManager.fromHandlers({
      handleLLMStart: async (llm, prompts, runId) => {
        logger.debug('LLM', `Starting LLM call with runId ${runId}`);
      },
      handleLLMEnd: async (output) => {
        logger.debug('LLM', `Completed with output: ${JSON.stringify(output)}`);
      },
      handleLLMError: async (err: Error) => {
        logger.error('LLM', `Error in LLM: ${err.message}`);
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      // 初始化基础模型
      switch (this.config.type) {
        case ModelType.GPT3:
        case ModelType.GPT4:
          this.model = new ChatOpenAI({
            modelName: this.config.model || 'gpt-4',
            temperature: this.config.temperature || 0.7,
            maxTokens: this.config.maxTokens,
            openAIApiKey: this.config.apiKey,
            callbacks: this.callbackManager
          }) as unknown as ExtendedBaseChatModel;
          break;
        
        case ModelType.CLAUDE:
        case ModelType.CLAUDE2:
          this.model = new ChatAnthropic({
            modelName: this.config.model || 'claude-2',
            temperature: this.config.temperature || 0.7,
            anthropicApiKey: this.config.apiKey,
            callbacks: this.callbackManager
          }) as unknown as ExtendedBaseChatModel;
          break;

        default:
          throw new Error(`Unsupported model type: ${this.config.type}`);
      }

      // 初始化嵌入模型
      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey: this.config.apiKey
      });

      // 初始化内存管理器
      await this.memoryManager.initialize({
        openAIApiKey: this.config.apiKey
      });

      // 恢复缓存
      await this.cacheManager.restore();

      // 初始化状态管理器
      await this.stateManager.restore();

      logger.info('LLM', `Initialized ${this.config.type} model`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('LLM', `Failed to initialize LangChain adapter: ${error.message}`);
      }
      throw error;
    }
  }

  async startSession(sessionId: string, config?: MemoryConfig): Promise<void> {
    try {
      this.currentSessionId = sessionId;
      await this.memoryManager.createBufferMemory(sessionId, config);
      const vectorMemory = await this.memoryManager.createVectorMemory(sessionId, config);
      this.promptManager.setMemory(vectorMemory);

      // 初始化会话状态
      await this.stateManager.setState(sessionId, {
        config,
        startTime: Date.now(),
        messageCount: 0,
        lastActivity: Date.now(),
        modelConfig: this.config
      });

      logger.info('LLM', `Started session ${sessionId}`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('LLM', `Failed to start session ${sessionId}: ${error.message}`);
      }
      throw error;
    }
  }

  async chat(messages: LangChainChatMessage[]): Promise<LLMResponse> {
    try {
      if (!this.currentSessionId) {
        throw new Error('No active session');
      }

      // 更新会话状态
      await this.stateManager.updateState(this.currentSessionId, (state) => ({
        ...state,
        messageCount: state.messageCount + messages.length,
        lastActivity: Date.now(),
        lastMessages: messages.map(msg => ({
          role: msg.role,
          content: this.serializeMessageContent(msg.content),
          metadata: msg.metadata
        }))
      }));

      // 生成缓存键
      const cacheKey = this.generateCacheKey(messages);
      
      // 检查缓存
      const cachedResponse = await this.cacheManager.get<LLMResponse>(cacheKey);
      if (cachedResponse) {
        logger.debug('LLM', `Cache hit for chat messages`);
        return cachedResponse;
      }

      // 转换消息格式
      const langchainMessages = messages.map(convertToBaseMessage);

      // 添加消息到历史记录
      for (const msg of messages) {
        await this.memoryManager.addMessage(this.currentSessionId, msg);
      }

      // 调用模型
      const response = await this.model.call(langchainMessages);
      const modelResponse = convertToModelResponse(response);

      // 添加响应到历史记录
      await this.memoryManager.addMessage(this.currentSessionId, {
        role: 'assistant',
        content: modelResponse.content
      });

      const result = {
        content: modelResponse.content,
        tokens: modelResponse.usage?.totalTokens || 0,
        model: this.config.model,
        timestamp: Date.now()
      };

      // 缓存响应
      await this.cacheManager.set(cacheKey, result);

      // 更新会话状态
      await this.stateManager.updateState(this.currentSessionId, (state) => ({
        ...state,
        lastResponse: result,
        lastResponseTime: Date.now()
      }));

      return result;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('LLM', `Chat error: ${error.message}`);
      }
      throw error;
    }
  }

  async analyze<T>(
    promptType: PromptType,
    params: PromptTemplateParams
  ): Promise<LLMResponse<T>> {
    try {
      if (!this.currentSessionId) {
        throw new Error('No active session');
      }

      // 更新会话状态
      await this.stateManager.updateState(this.currentSessionId, (state) => ({
        ...state,
        lastAnalysis: {
          promptType,
          params,
          timestamp: Date.now()
        }
      }));

      // 生成缓存键
      const cacheKey = this.generateCacheKey([promptType, params]);
      
      // 检查缓存
      const cachedResponse = await this.cacheManager.get<LLMResponse<T>>(cacheKey);
      if (cachedResponse) {
        logger.debug('LLM', `Cache hit for analysis`);
        return cachedResponse;
      }

      // 获取提示词模板
      const promptContent = await this.promptManager.getPrompt(promptType, params);

      // 创建 LLM 链
      const chain = new LLMChain({
        llm: this.model,
        prompt: Array.isArray(promptContent) 
          ? this.promptManager.getTemplate(promptType)!
          : PromptTemplate.fromTemplate(promptContent),
        memory: this.memoryManager.getMemory(this.currentSessionId)
      });

      // 执行分析
      const response = await chain.call(params);

      const result = {
        content: response.text,
        tokens: response.usage?.totalTokens || 0,
        model: this.config.model,
        timestamp: Date.now(),
        metadata: {
          promptType,
          params
        }
      };

      // 缓存响应
      await this.cacheManager.set(cacheKey, result);

      // 更新会话状态
      await this.stateManager.updateState(this.currentSessionId, (state) => ({
        ...state,
        lastAnalysisResult: result,
        lastAnalysisTime: Date.now()
      }));

      return result;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('LLM', `Analysis error: ${error.message}`);
      }
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      // 生成缓存键
      const cacheKey = this.generateCacheKey(['embedding', text]);
      
      // 检查缓存
      const cachedEmbedding = await this.cacheManager.get<number[]>(cacheKey);
      if (cachedEmbedding) {
        logger.debug('LLM', `Cache hit for embedding`);
        return cachedEmbedding;
      }

      const embedding = await this.embeddings.embedQuery(text);

      // 缓存嵌入向量
      await this.cacheManager.set(cacheKey, embedding);

      return embedding;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('LLM', `Embedding error: ${error.message}`);
      }
      throw error;
    }
  }

  private generateCacheKey(data: any): string {
    // 生成一个稳定的缓存键
    const hash = require('crypto')
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
    return `${this.currentSessionId}:${hash}`;
  }

  async searchMemory(query: string, limit?: number): Promise<any[]> {
    try {
      if (!this.currentSessionId) {
        throw new Error('No active session');
      }

      return await this.memoryManager.searchMemory(this.currentSessionId, query, limit);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('LLM', `Memory search error: ${error.message}`);
      }
      throw error;
    }
  }

  async endSession(): Promise<void> {
    try {
      if (this.currentSessionId) {
        // 获取会话状态
        const sessionState = await this.stateManager.getState(this.currentSessionId);
        if (sessionState) {
          // 记录会话统计信息
          logger.info('LLM', `Session ${this.currentSessionId} stats:`, {
            duration: Date.now() - sessionState.startTime,
            messageCount: sessionState.messageCount,
            lastActivity: new Date(sessionState.lastActivity).toISOString()
          });
        }

        await this.memoryManager.clearMemory(this.currentSessionId);
        await this.stateManager.deleteState(this.currentSessionId);
        this.currentSessionId = '';
        logger.info('LLM', 'Session ended');
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('LLM', `Failed to end session: ${error.message}`);
      }
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      // 清理资源
      if (this.currentSessionId) {
        await this.endSession();
      }
      await this.memoryManager.clearAllMemories();
      await this.cacheManager.persist();
      await this.stateManager.shutdown();
      this.model = undefined as any;
      this.embeddings = undefined as any;
      this.callbackManager = undefined as any;
      await this.promptManager.clearMemory();
      await this.pluginAdapter.shutdown();
      logger.info('LLM', 'LangChain adapter shut down');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('LLM', `Shutdown error: ${error.message}`);
      }
      throw error;
    }
  }

  // 新增方法：获取会话状态
  async getSessionState<T = any>(): Promise<T | null> {
    if (!this.currentSessionId) {
      return null;
    }
    return await this.stateManager.getState<T>(this.currentSessionId);
  }

  // 新增方法：获取会话统计信息
  async getSessionStats(): Promise<{
    duration: number;
    messageCount: number;
    lastActivity: string;
    modelConfig: ModelConfig;
  } | null> {
    const state = await this.getSessionState();
    if (!state) {
      return null;
    }

    return {
      duration: Date.now() - state.startTime,
      messageCount: state.messageCount,
      lastActivity: new Date(state.lastActivity).toISOString(),
      modelConfig: state.modelConfig
    };
  }

  // 新增方法：序列化消息内容
  private serializeMessageContent(content: ExtendedMessageContent): string {
    if (typeof content === 'string') {
      return content;
    }
    if (typeof content === 'object' && content !== null) {
      return JSON.stringify(content);
    }
    return String(content);
  }

  public async registerPlugin(
    plugin: Plugin,
    toolConfigs: PluginToolConfig[]
  ): Promise<void> {
    try {
      // 为每个工具配置创建工具
      const tools = await Promise.all(
        toolConfigs.map(config => this.pluginAdapter.createTool(plugin, config))
      );

      // 将工具添加到工具管理器
      tools.forEach(tool => {
        this.toolManager.registerTool(tool, {
          name: tool.name,
          description: tool.description,
          enabled: true
        });
      });

      logger.info('LLM', `Registered plugin ${plugin.getName()} with ${tools.length} tools`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('LLM', `Failed to register plugin ${plugin.getName()}: ${error.message}`);
      }
      throw error;
    }
  }

  public async unregisterPlugin(pluginName: string): Promise<void> {
    try {
      // 获取插件的所有工具
      const tools = this.pluginAdapter.getTools().filter(tool => 
        tool.name.startsWith(`${pluginName}:`)
      );

      // 从工具管理器中移除工具
      tools.forEach(tool => {
        this.toolManager.unregisterTool(tool.name);
      });

      // 从插件适配器中移除工具
      this.pluginAdapter.deletePluginTools(pluginName);

      logger.info('LLM', `Unregistered plugin ${pluginName}`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('LLM', `Failed to unregister plugin ${pluginName}: ${error.message}`);
      }
      throw error;
    }
  }
}