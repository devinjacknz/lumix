import { BaseChain } from '@langchain/core/chains';
import { ChainValues } from '@langchain/core/utils/types';
import { BaseCallbackConfig } from '@langchain/core/callbacks/manager';
import { StreamProcessor, StreamConfig, ProcessResult } from './processor';

/**
 * 流处理链配置
 */
export interface StreamChainConfig extends StreamConfig {
  name?: string;
  description?: string;
  verbose?: boolean;
}

/**
 * LangChain 风格的流处理链
 */
export class StreamChain extends BaseChain {
  private processor: StreamProcessor;
  private config: Required<StreamChainConfig>;

  constructor(config: StreamChainConfig = {}) {
    super();
    this.processor = new StreamProcessor();
    this.config = {
      name: config.name || 'StreamChain',
      description: config.description || 'A chain for processing data streams',
      verbose: config.verbose || false,
      batchSize: config.batchSize || 100,
      timeout: config.timeout || 5000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000
    };
  }

  _chainType(): string {
    return 'stream_chain';
  }

  get inputKeys(): string[] {
    return ['input'];
  }

  get outputKeys(): string[] {
    return ['output'];
  }

  /**
   * 处理输入数据
   */
  async _call(
    values: ChainValues,
    runManager?: BaseCallbackConfig
  ): Promise<ChainValues> {
    const input = values.input;
    
    if (this.config.verbose) {
      console.log(`Processing input in ${this.config.name}:`, input);
    }

    try {
      // 初始化处理器
      await this.processor.initialize({
        batchSize: this.config.batchSize,
        timeout: this.config.timeout,
        retryAttempts: this.config.retryAttempts,
        retryDelay: this.config.retryDelay
      });

      // 处理数据
      const result = await this.processor.process(input);

      if (result.success) {
        return { output: result.data };
      } else {
        throw result.error;
      }
    } catch (error) {
      if (this.config.verbose) {
        console.error(`Error in ${this.config.name}:`, error);
      }
      throw error;
    }
  }

  /**
   * 添加处理器
   */
  addProcessor(processor: StreamProcessor): void {
    this.processor = processor;
  }

  /**
   * 获取处理器
   */
  getProcessor(): StreamProcessor {
    return this.processor;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<StreamChainConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * 获取配置
   */
  getConfig(): StreamChainConfig {
    return this.config;
  }
}