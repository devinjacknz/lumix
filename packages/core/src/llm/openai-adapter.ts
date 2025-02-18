import { Configuration, OpenAIApi } from 'openai';
import { logger } from '../monitoring';
import { messagingMiddleware } from '../messaging';
import { EventType } from '../messaging/types';
import {
  LLMInterface,
  ModelConfig,
  ModelType,
  PromptTemplate,
  PromptTemplateParams,
  LLMResponse
} from './types';
import { PromptTemplateManager } from './prompt-templates';
import { ResponseParser } from './response-parser';

export class OpenAIAdapter implements LLMInterface {
  private openai: OpenAIApi | null = null;
  private config: ModelConfig | null = null;
  private templateManager: PromptTemplateManager;
  private currentTemplate: PromptTemplate | null = null;

  constructor() {
    this.templateManager = PromptTemplateManager.getInstance();
  }

  public async initialize(config: ModelConfig): Promise<void> {
    try {
      // 验证配置
      this.validateConfig(config);
      this.config = config;

      // 初始化OpenAI客户端
      const configuration = new Configuration({
        apiKey: config.apiKey
      });
      this.openai = new OpenAIApi(configuration);

      logger.info('LLM', 'OpenAI adapter initialized', {
        model: config.type
      });
    } catch (error) {
      logger.error('LLM', 'Failed to initialize OpenAI adapter', { error });
      throw error;
    }
  }

  public async generatePrompt(
    template: PromptTemplate,
    params: PromptTemplateParams
  ): Promise<string> {
    this.currentTemplate = template;
    return this.templateManager.generatePrompt(template, params);
  }

  public async analyze<T>(prompt: string): Promise<LLMResponse<T>> {
    if (!this.openai || !this.config) {
      throw new Error('OpenAI adapter not initialized');
    }

    const startTime = Date.now();

    try {
      // 发送请求到OpenAI
      const response = await this.openai.createChatCompletion({
        model: this.config.type,
        messages: [
          { role: 'system', content: '你是一个专业的加密货币交易策略分析师，请基于提供的信息进行分析并提供建议。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        top_p: this.config.topP,
        frequency_penalty: this.config.frequencyPenalty,
        presence_penalty: this.config.presencePenalty,
        stop: this.config.stopSequences
      });

      const result = response.data;
      const content = result.choices[0].message?.content;

      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // 解析响应
      const data = this.parseResponse<T>(content);
      const latency = Date.now() - startTime;

      // 构建响应对象
      const llmResponse: LLMResponse<T> = {
        success: true,
        data,
        usage: {
          promptTokens: result.usage?.prompt_tokens || 0,
          completionTokens: result.usage?.completion_tokens || 0,
          totalTokens: result.usage?.total_tokens || 0,
          cost: this.calculateCost(result.usage?.total_tokens || 0)
        },
        metadata: {
          model: this.config.type,
          timestamp: new Date(),
          latency
        }
      };

      // 发出事件
      await this.emitAnalysisEvent(llmResponse);

      logger.debug('LLM', 'Analysis completed', {
        tokens: llmResponse.usage?.totalTokens,
        latency
      });

      return llmResponse;
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error('LLM', 'Analysis failed', { error, latency });

      return {
        success: false,
        error: {
          code: 'ANALYSIS_FAILED',
          message: error.message,
          details: error.response?.data
        },
        metadata: {
          model: this.config.type,
          timestamp: new Date(),
          latency
        }
      };
    }
  }

  public async shutdown(): Promise<void> {
    this.openai = null;
    this.config = null;
    logger.info('LLM', 'OpenAI adapter shut down');
  }

  private validateConfig(config: ModelConfig): void {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    if (!Object.values(ModelType).includes(config.type)) {
      throw new Error(`Unsupported model type: ${config.type}`);
    }

    if (config.maxTokens <= 0) {
      throw new Error('Invalid max tokens');
    }

    if (config.temperature < 0 || config.temperature > 1) {
      throw new Error('Temperature must be between 0 and 1');
    }
  }

  private parseResponse<T>(content: string): T {
    try {
      // 首先尝试解析JSON
      try {
        return JSON.parse(content);
      } catch {
        // 如果不是JSON格式，使用结构化数据提取
        return this.extractStructuredData<T>(content);
      }
    } catch (error) {
      logger.error('LLM', 'Failed to parse response', { error });
      throw error;
    }
  }

  private extractStructuredData<T>(content: string): T {
    try {
      // 根据当前模板类型使用不同的解析方法
      if (!this.currentTemplate) {
        throw new Error('No template type specified');
      }

      switch (this.currentTemplate) {
        case PromptTemplate.STRATEGY_ANALYSIS:
          return ResponseParser.parseStrategyAnalysis(content) as T;
        case PromptTemplate.MARKET_ANALYSIS:
          return ResponseParser.parseMarketAnalysis(content) as T;
        case PromptTemplate.RISK_ASSESSMENT:
          return ResponseParser.parseRiskAssessment(content) as T;
        default:
          throw new Error(`Unsupported template type: ${this.currentTemplate}`);
      }
    } catch (error) {
      logger.error('LLM', 'Failed to extract structured data', { error });
      throw error;
    }
  }

  private calculateCost(tokens: number): number {
    // 根据不同模型计算成本
    const ratePerToken = {
      [ModelType.GPT4]: 0.00003,
      [ModelType.GPT4_TURBO]: 0.00001,
      [ModelType.GPT35_TURBO]: 0.000002
    };

    return tokens * (ratePerToken[this.config?.type || ModelType.GPT35_TURBO]);
  }

  private async emitAnalysisEvent<T>(response: LLMResponse<T>): Promise<void> {
    await messagingMiddleware.emitEvent({
      type: EventType.METRICS_UPDATED,
      timestamp: new Date(),
      data: {
        metrics: {
          'llm.requests': 1,
          'llm.tokens': response.usage?.totalTokens || 0,
          'llm.latency': response.metadata?.latency || 0,
          'llm.cost': response.usage?.cost || 0
        }
      }
    });
  }
} 