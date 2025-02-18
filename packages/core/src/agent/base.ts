import { BaseChain } from '@langchain/core/chains';
import { AgentAction, AgentFinish } from '@langchain/core/agents';
import { BaseMessage } from '@langchain/core/messages';
import { ChainValues } from '@langchain/core/utils/types';
import { BaseCallbackConfig } from '@langchain/core/callbacks/manager';

/**
 * 代理配置
 */
export interface AgentConfig {
  name?: string;
  description?: string;
  maxIterations?: number;
  returnIntermediateSteps?: boolean;
  verbose?: boolean;
}

/**
 * 代理执行结果
 */
export interface AgentExecuteResult {
  output: any;
  intermediateSteps?: AgentAction[];
}

/**
 * LangChain 风格的基础代理
 */
export abstract class BaseAgent extends BaseChain {
  protected config: Required<AgentConfig>;

  constructor(config: AgentConfig = {}) {
    super();
    this.config = {
      name: config.name || 'BaseAgent',
      description: config.description || 'A base agent for task execution',
      maxIterations: config.maxIterations || 10,
      returnIntermediateSteps: config.returnIntermediateSteps || false,
      verbose: config.verbose || false
    };
  }

  _chainType(): string {
    return 'base_agent';
  }

  get inputKeys(): string[] {
    return ['input'];
  }

  get outputKeys(): string[] {
    return ['output'];
  }

  /**
   * 执行代理任务
   */
  async _call(
    values: ChainValues,
    runManager?: BaseCallbackConfig
  ): Promise<ChainValues> {
    const input = values.input;
    const intermediateSteps: AgentAction[] = [];

    if (this.config.verbose) {
      console.log(`Starting execution in ${this.config.name}:`, input);
    }

    try {
      let iteration = 0;
      let shouldContinue = true;

      while (shouldContinue && iteration < this.config.maxIterations) {
        // 获取下一个动作
        const nextAction = await this.getNextAction(input, intermediateSteps);

        if (this.shouldFinish(nextAction)) {
          const finish = nextAction as AgentFinish;
          return this.prepareOutput(finish, intermediateSteps);
        }

        // 执行动作
        const action = nextAction as AgentAction;
        const observation = await this.executeAction(action);
        intermediateSteps.push(action);

        if (this.config.verbose) {
          console.log(`Step ${iteration + 1}:`, {
            action,
            observation
          });
        }

        // 更新状态
        shouldContinue = await this.shouldContinue(observation);
        iteration++;
      }

      // 达到最大迭代次数
      if (iteration >= this.config.maxIterations) {
        throw new Error(`Exceeded max iterations (${this.config.maxIterations})`);
      }

      return this.prepareOutput(null, intermediateSteps);
    } catch (error) {
      if (this.config.verbose) {
        console.error(`Error in ${this.config.name}:`, error);
      }
      throw error;
    }
  }

  /**
   * 获取下一个动作
   */
  protected abstract getNextAction(
    input: any,
    intermediateSteps: AgentAction[]
  ): Promise<AgentAction | AgentFinish>;

  /**
   * 执行动作
   */
  protected abstract executeAction(action: AgentAction): Promise<BaseMessage>;

  /**
   * 判断是否应该继续
   */
  protected abstract shouldContinue(observation: BaseMessage): Promise<boolean>;

  /**
   * 判断是否应该结束
   */
  protected shouldFinish(
    action: AgentAction | AgentFinish
  ): action is AgentFinish {
    return 'returnValues' in action;
  }

  /**
   * 准备输出结果
   */
  protected prepareOutput(
    finish: AgentFinish | null,
    intermediateSteps: AgentAction[]
  ): ChainValues {
    const output: AgentExecuteResult = {
      output: finish ? finish.returnValues.output : null
    };

    if (this.config.returnIntermediateSteps) {
      output.intermediateSteps = intermediateSteps;
    }

    return output;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AgentConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * 获取配置
   */
  getConfig(): AgentConfig {
    return this.config;
  }
} 