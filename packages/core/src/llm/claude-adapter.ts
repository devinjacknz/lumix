import { logger } from '../monitoring';
import { messagingMiddleware } from '../messaging';
import { EventType } from '../messaging/types';
import {
  LLMInterface,
  ModelConfig,
  ModelType,
  PromptTemplate,
  PromptTemplateParams,
  LLMResponse,
  StrategyAnalysis,
  MarketAnalysis,
  RiskAssessment
} from './types';
import { PromptTemplateManager } from './prompt-templates';
import { ResponseParser } from './response-parser';

export class ClaudeAdapter implements LLMInterface {
  private apiKey: string | null = null;
  private config: ModelConfig | null = null;
  private templateManager: PromptTemplateManager;
  private baseUrl = 'https://api.anthropic.com/v1';
  private currentTemplate: PromptTemplate | null = null;

  constructor() {
    this.templateManager = PromptTemplateManager.getInstance();
  }

  public async initialize(config: ModelConfig): Promise<void> {
    try {
      // 验证配置
      this.validateConfig(config);
      this.config = config;
      this.apiKey = config.apiKey;

      logger.info('LLM', 'Claude adapter initialized', {
        model: config.type
      });
    } catch (error) {
      logger.error('LLM', 'Failed to initialize Claude adapter', { error });
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
    if (!this.apiKey || !this.config) {
      throw new Error('Claude adapter not initialized');
    }

    const startTime = Date.now();

    try {
      // 发送请求到Claude API
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.config.type,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          top_p: this.config.topP,
          stop_sequences: this.config.stopSequences
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`);
      }

      const result = await response.json();
      const content = result.content[0].text;

      if (!content) {
        throw new Error('Empty response from Claude');
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
    this.apiKey = null;
    this.config = null;
    logger.info('LLM', 'Claude adapter shut down');
  }

  private validateConfig(config: ModelConfig): void {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    if (![ModelType.CLAUDE, ModelType.CLAUDE2].includes(config.type)) {
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
      // 尝试直接解析JSON
      return JSON.parse(content);
    } catch {
      // 如果不是JSON格式，尝试从文本中提取结构化数据
      return this.extractStructuredData<T>(content);
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
      [ModelType.CLAUDE]: 0.000008,
      [ModelType.CLAUDE2]: 0.000012
    };

    return tokens * (ratePerToken[this.config?.type || ModelType.CLAUDE]);
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