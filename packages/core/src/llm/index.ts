export * from './types';
export * from './prompt-templates';
export * from './llm-factory';

import { LLMFactory } from './llm-factory';
import { ModelConfig, ModelType } from './types';

// 默认配置
const defaultConfig: ModelConfig = {
  type: ModelType.GPT35_TURBO,
  apiKey: process.env.OPENAI_API_KEY || '',
  maxTokens: 2048,
  temperature: 0.7,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stopSequences: []
};

// 导出工厂实例
export const llmFactory = LLMFactory.getInstance();

// 导出默认配置
export { defaultConfig }; 