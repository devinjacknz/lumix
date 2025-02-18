import { logger } from '../monitoring';
import { LLMInterface, ModelConfig, ModelType } from './types';
import { LangChainAdapter } from './langchain-adapter';

export class LLMFactory {
  private static instance: LLMFactory;
  private adapters: Map<ModelType, LLMInterface>;

  private constructor() {
    this.adapters = new Map();
  }

  public static getInstance(): LLMFactory {
    if (!LLMFactory.instance) {
      LLMFactory.instance = new LLMFactory();
    }
    return LLMFactory.instance;
  }

  public async getAdapter(config: ModelConfig): Promise<LLMInterface> {
    const key = config.type;
    
    if (this.adapters.has(key)) {
      return this.adapters.get(key)!;
    }

    const adapter = await this.createAdapter(config);
    this.adapters.set(key, adapter);
    return adapter;
  }

  public async shutdown(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.shutdown();
    }
    this.adapters.clear();
    logger.info('LLM', 'All LLM adapters shut down');
  }

  private async createAdapter(config: ModelConfig): Promise<LLMInterface> {
    try {
      const adapter = new LangChainAdapter(config);
      await adapter.initialize();
      return adapter;
    } catch (error) {
      logger.error('LLM', 'Failed to create LLM adapter', {
        type: config.type,
        error: error.message
      });
      throw error;
    }
  }
} 