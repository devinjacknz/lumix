import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage } from "@langchain/core/messages";
import { AgentConfig } from "@lumix/core";

export abstract class BaseModelAdapter {
  protected config: AgentConfig;
  protected model: BaseChatModel;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  abstract initialize(): Promise<void>;

  async generateResponse(messages: BaseMessage[]): Promise<string> {
    if (!this.model) {
      await this.initialize();
    }

    const response = await this.model.invoke(messages);
    return response.content as string;
  }

  getModel(): BaseChatModel {
    return this.model;
  }
}
