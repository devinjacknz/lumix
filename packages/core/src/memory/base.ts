import { BaseMemory } from '@langchain/core/memory';
import { InputValues, MemoryVariables, OutputValues } from '@langchain/core/memory';

/**
 * 记忆配置
 */
export interface MemoryConfig {
  // 基础配置
  returnMessages?: boolean;
  inputKey?: string;
  outputKey?: string;
  humanPrefix?: string;
  aiPrefix?: string;

  // 记忆管理
  maxTokens?: number;
  contextWindow?: number;
  memoryKey?: string;

  // 向量存储
  vectorStore?: boolean;
  similarityThreshold?: number;
  maxRelevantDocs?: number;
}

/**
 * LangChain 风格的基础记忆系统
 */
export abstract class BaseMemorySystem extends BaseMemory {
  protected config: Required<MemoryConfig>;

  constructor(config: MemoryConfig = {}) {
    super();
    this.config = {
      returnMessages: config.returnMessages || true,
      inputKey: config.inputKey || 'input',
      outputKey: config.outputKey || 'output',
      humanPrefix: config.humanPrefix || 'Human',
      aiPrefix: config.aiPrefix || 'Assistant',
      maxTokens: config.maxTokens || 2000,
      contextWindow: config.contextWindow || 4,
      memoryKey: config.memoryKey || 'chat_history',
      vectorStore: config.vectorStore || false,
      similarityThreshold: config.similarityThreshold || 0.8,
      maxRelevantDocs: config.maxRelevantDocs || 3
    };
  }

  /**
   * 获取记忆变量
   */
  async loadMemoryVariables(values: InputValues): Promise<MemoryVariables> {
    const memories = await this.getRelevantMemories(values);
    return this.formatMemories(memories);
  }

  /**
   * 保存上下文
   */
  async saveContext(
    inputValues: InputValues,
    outputValues: OutputValues
  ): Promise<void> {
    const formattedInput = this.formatInput(inputValues);
    const formattedOutput = this.formatOutput(outputValues);
    await this.addMemory(formattedInput, formattedOutput);
  }

  /**
   * 清理记忆
   */
  async clear(): Promise<void> {
    await this.clearMemories();
  }

  /**
   * 获取相关记忆
   */
  protected abstract getRelevantMemories(
    values: InputValues
  ): Promise<MemoryVariables[]>;

  /**
   * 添加记忆
   */
  protected abstract addMemory(
    input: string,
    output: string
  ): Promise<void>;

  /**
   * 清理记忆
   */
  protected abstract clearMemories(): Promise<void>;

  /**
   * 格式化输入
   */
  protected formatInput(values: InputValues): string {
    const input = values[this.config.inputKey];
    return `${this.config.humanPrefix}: ${input}`;
  }

  /**
   * 格式化输出
   */
  protected formatOutput(values: OutputValues): string {
    const output = values[this.config.outputKey];
    return `${this.config.aiPrefix}: ${output}`;
  }

  /**
   * 格式化记忆
   */
  protected formatMemories(memories: MemoryVariables[]): MemoryVariables {
    if (this.config.returnMessages) {
      return {
        [this.config.memoryKey]: memories
      };
    }

    // 将记忆合并为字符串
    const formattedMemories = memories
      .map(memory => Object.values(memory).join('\n'))
      .join('\n');

    return {
      [this.config.memoryKey]: formattedMemories
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<MemoryConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * 获取配置
   */
  getConfig(): MemoryConfig {
    return this.config;
  }
} 