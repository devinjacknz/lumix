import {
  PromptTemplate,
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
  AIMessagePromptTemplate,
  MessagesPlaceholder
} from "langchain/prompts";
import { BaseMemory } from "langchain/memory";
import { PromptTemplate as PromptType, PromptTemplateParams } from './types';
import { logger } from '../monitoring';

export class PromptManager {
  private static instance: PromptManager;
  private templates: Map<PromptType, PromptTemplate | ChatPromptTemplate>;
  private memory?: BaseMemory;

  private constructor() {
    this.templates = new Map();
    this.initializeTemplates();
  }

  public static getInstance(): PromptManager {
    if (!PromptManager.instance) {
      PromptManager.instance = new PromptManager();
    }
    return PromptManager.instance;
  }

  private initializeTemplates() {
    // 策略分析模板
    this.registerTemplate(
      PromptType.STRATEGY_ANALYSIS,
      ChatPromptTemplate.fromPromptMessages([
        SystemMessagePromptTemplate.fromTemplate(
          "你是一个专业的策略分析师。请基于以下市场数据进行分析:\n{marketData}"
        ),
        new MessagesPlaceholder("history"),
        HumanMessagePromptTemplate.fromTemplate(
          "请分析当前市场情况并提供交易建议。考虑以下因素:\n" +
          "1. 市场趋势\n" +
          "2. 风险评估\n" +
          "3. 机会识别\n" +
          "4. 建议操作\n" +
          "\n具体数据: {portfolioData}"
        )
      ])
    );

    // 市场分析模板
    this.registerTemplate(
      PromptType.MARKET_ANALYSIS,
      ChatPromptTemplate.fromPromptMessages([
        SystemMessagePromptTemplate.fromTemplate(
          "你是一个市场分析专家。请分析以下市场数据:\n{marketData}"
        ),
        new MessagesPlaceholder("history"),
        HumanMessagePromptTemplate.fromTemplate(
          "请提供详细的市场分析报告，包括:\n" +
          "1. 市场概况\n" +
          "2. 主要指标分析\n" +
          "3. 风险因素\n" +
          "4. 未来趋势预测\n" +
          "\n数据: {indicators}"
        )
      ])
    );

    // 风险评估模板
    this.registerTemplate(
      PromptType.RISK_ASSESSMENT,
      ChatPromptTemplate.fromPromptMessages([
        SystemMessagePromptTemplate.fromTemplate(
          "你是一个风险管理专家。请评估以下情况的风险:\n{context}"
        ),
        new MessagesPlaceholder("history"),
        HumanMessagePromptTemplate.fromTemplate(
          "请提供全面的风险评估报告，包括:\n" +
          "1. 风险等级\n" +
          "2. 主要风险因素\n" +
          "3. 缓解措施\n" +
          "4. 监控建议\n" +
          "\n评估数据: {riskData}"
        )
      ])
    );

    // 链上分析模板
    this.registerTemplate(
      PromptType.ONCHAIN_ANALYSIS,
      ChatPromptTemplate.fromPromptMessages([
        SystemMessagePromptTemplate.fromTemplate(
          "你是一个区块链数据分析师。请分析以下链上数据:\n{onchainData}"
        ),
        new MessagesPlaceholder("history"),
        HumanMessagePromptTemplate.fromTemplate(
          "请提供链上活动分析报告，包括:\n" +
          "1. 交易活跃度\n" +
          "2. 地址行为\n" +
          "3. 智能合约互动\n" +
          "4. 异常检测\n" +
          "\n链上数据: {transactionData}"
        )
      ])
    );
  }

  public registerTemplate(
    type: PromptType,
    template: PromptTemplate | ChatPromptTemplate
  ): void {
    this.templates.set(type, template);
    logger.info('Prompt', `Registered template for type: ${type}`);
  }

  public async getPrompt(
    type: PromptType,
    params: PromptTemplateParams
  ): Promise<string | string[]> {
    const template = this.templates.get(type);
    if (!template) {
      throw new Error(`Template not found for type: ${type}`);
    }

    try {
      if (template instanceof ChatPromptTemplate) {
        const messages = await template.formatMessages({
          ...params,
          history: this.memory ? await this.memory.loadMemoryVariables({}) : []
        });
        return messages.map(m => m.content);
      } else {
        return template.format(params);
      }
    } catch (error) {
      logger.error('Prompt', `Failed to format prompt: ${error.message}`);
      throw error;
    }
  }

  public setMemory(memory: BaseMemory): void {
    this.memory = memory;
    logger.info('Prompt', 'Memory component set for prompt manager');
  }

  public async clearMemory(): Promise<void> {
    if (this.memory) {
      await this.memory.clear();
      logger.info('Prompt', 'Memory cleared');
    }
  }

  public getTemplate(type: PromptType): PromptTemplate | ChatPromptTemplate | undefined {
    return this.templates.get(type);
  }

  public listTemplates(): PromptType[] {
    return Array.from(this.templates.keys());
  }

  public removeTemplate(type: PromptType): boolean {
    const result = this.templates.delete(type);
    if (result) {
      logger.info('Prompt', `Template removed for type: ${type}`);
    }
    return result;
  }
} 