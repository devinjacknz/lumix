import { PromptTemplate } from '@langchain/core/prompts';
import { BaseOutputParser } from '@langchain/core/output_parsers';
import { BaseMemory } from '@langchain/core/memory';
import { RenderableConfig } from '@langchain/core/prompts/base';

/**
 * 提示模板配置
 */
export interface PromptConfig {
  template: string;
  inputVariables: string[];
  outputParser?: BaseOutputParser;
  memory?: BaseMemory;
  partialVariables?: Record<string, any>;
  templateFormat?: string;
  validateTemplate?: boolean;
}

/**
 * 提示模板管理器
 */
export class PromptManager {
  private templates: Map<string, PromptTemplate>;
  private defaultConfig: Partial<PromptConfig>;

  constructor(defaultConfig: Partial<PromptConfig> = {}) {
    this.templates = new Map();
    this.defaultConfig = defaultConfig;
  }

  /**
   * 创建提示模板
   */
  createTemplate(
    name: string,
    config: PromptConfig
  ): PromptTemplate {
    const template = new PromptTemplate({
      template: config.template,
      inputVariables: config.inputVariables,
      outputParser: config.outputParser,
      partialVariables: config.partialVariables,
      templateFormat: config.templateFormat || this.defaultConfig.templateFormat,
      validateTemplate: config.validateTemplate ?? this.defaultConfig.validateTemplate
    });

    this.templates.set(name, template);
    return template;
  }

  /**
   * 获取提示模板
   */
  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * 删除提示模板
   */
  deleteTemplate(name: string): boolean {
    return this.templates.delete(name);
  }

  /**
   * 更新提示模板
   */
  updateTemplate(
    name: string,
    config: Partial<PromptConfig>
  ): PromptTemplate {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template ${name} not found`);
    }

    const updatedConfig = {
      template: config.template || template.template,
      inputVariables: config.inputVariables || template.inputVariables,
      outputParser: config.outputParser || template.outputParser,
      partialVariables: {
        ...template.partialVariables,
        ...config.partialVariables
      },
      templateFormat: config.templateFormat || template.templateFormat,
      validateTemplate: config.validateTemplate ?? template.validateTemplate
    };

    return this.createTemplate(name, updatedConfig);
  }

  /**
   * 格式化提示
   */
  async formatPrompt(
    name: string,
    variables: Record<string, any>
  ): Promise<string> {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template ${name} not found`);
    }

    return template.format(variables);
  }

  /**
   * 批量创建模板
   */
  batchCreateTemplates(
    templates: Record<string, PromptConfig>
  ): void {
    for (const [name, config] of Object.entries(templates)) {
      this.createTemplate(name, config);
    }
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): Map<string, PromptTemplate> {
    return this.templates;
  }

  /**
   * 清理所有模板
   */
  clearTemplates(): void {
    this.templates.clear();
  }

  /**
   * 更新默认配置
   */
  updateDefaultConfig(config: Partial<PromptConfig>): void {
    this.defaultConfig = {
      ...this.defaultConfig,
      ...config
    };
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig(): Partial<PromptConfig> {
    return this.defaultConfig;
  }
} 