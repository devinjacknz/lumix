import { ChatOpenAI } from "@langchain/openai";
import { AgentConfig } from "@lumix/core";
import { BaseModelAdapter } from "./base";

export class OpenAIAdapter extends BaseModelAdapter {
  constructor(config: AgentConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    this.model = new ChatOpenAI({
      openAIApiKey: this.config.apiKey,
      modelName: this.config.model || "gpt-4",
      temperature: this.config.temperature || 0.7,
      maxTokens: this.config.maxTokens,
    });
  }
}

export class ZhipuAIAdapter extends BaseModelAdapter {
  constructor(config: AgentConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    this.model = new ChatOpenAI({
      openAIApiKey: this.config.apiKey,
      modelName: this.config.model || "glm-4",
      temperature: this.config.temperature || 0.7,
      maxTokens: this.config.maxTokens,
      configuration: {
        baseURL: "https://open.bigmodel.cn/api/paas/v4/chat/completions"
      }
    });
  }
}

export function createModelAdapter(config: AgentConfig): BaseModelAdapter {
  switch (config.provider) {
    case "openai":
      return new OpenAIAdapter(config);
    case "zhipu":
      return new ZhipuAIAdapter(config);
    default:
      throw new Error(`Unsupported model provider: ${config.provider}`);
  }
}
