import { 
  AgentExecutor,
  initializeAgentExecutorWithOptions
} from "langchain/agents";
import { Tool } from "langchain/tools";
import { BaseLanguageModel } from "langchain/base_language";
import { BaseMemory } from "langchain/memory";
import { logger } from '../monitoring';
import { EventEmitter } from 'events';
import { ToolManager } from './tool-manager';

export interface AgentConfig {
  name: string;
  description: string;
  type: 'zero-shot' | 'structured' | 'conversational';
  maxIterations?: number;
  returnIntermediateSteps?: boolean;
  earlyStoppingMethod?: 'force' | 'generate';
  memory?: BaseMemory;
}

export interface AgentStats {
  executions: number;
  errors: number;
  avgDuration: number;
  lastUsed: number;
  successRate: number;
  avgSteps: number;
}

export class AgentManager extends EventEmitter {
  private static instance: AgentManager;
  private agents: Map<string, AgentExecutor>;
  private configs: Map<string, AgentConfig>;
  private stats: Map<string, AgentStats>;
  private model?: BaseLanguageModel;
  private toolManager: ToolManager;

  private constructor() {
    super();
    this.agents = new Map();
    this.configs = new Map();
    this.stats = new Map();
    this.toolManager = ToolManager.getInstance();
  }

  public static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  public setModel(model: BaseLanguageModel): void {
    this.model = model;
    // 更新所有代理的模型
    this.agents.forEach(agent => {
      agent.llmChain.llm = model;
    });
  }

  public async createAgent(config: AgentConfig): Promise<void> {
    try {
      if (this.agents.has(config.name)) {
        throw new Error(`Agent ${config.name} already exists`);
      }

      if (!this.model) {
        throw new Error('Language model not set');
      }

      // 获取启用的工具
      const tools = this.toolManager.getEnabledTools();
      if (tools.length === 0) {
        throw new Error('No enabled tools available');
      }

      // 创建代理执行器
      const agent = await initializeAgentExecutorWithOptions(
        tools,
        this.model,
        {
          agentType: config.type,
          maxIterations: config.maxIterations,
          returnIntermediateSteps: config.returnIntermediateSteps,
          earlyStoppingMethod: config.earlyStoppingMethod,
          memory: config.memory,
          verbose: true
        }
      );

      // 添加代理统计
      this.stats.set(config.name, {
        executions: 0,
        errors: 0,
        avgDuration: 0,
        lastUsed: 0,
        successRate: 1,
        avgSteps: 0
      });

      // 存储配置和代理
      this.configs.set(config.name, config);
      this.agents.set(config.name, agent);

      logger.info('Agent', `Created agent: ${config.name}`);
      this.emit('agentCreated', { name: config.name, config });
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Agent', `Failed to create agent ${config.name}: ${error.message}`);
      }
      throw error;
    }
  }

  public async deleteAgent(name: string): Promise<void> {
    try {
      const agent = this.agents.get(name);
      if (agent) {
        // 清理代理资源
        if (agent.memory) {
          await agent.memory.clear();
        }
        this.agents.delete(name);
        this.configs.delete(name);
        this.stats.delete(name);

        logger.info('Agent', `Deleted agent: ${name}`);
        this.emit('agentDeleted', { name });
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Agent', `Failed to delete agent ${name}: ${error.message}`);
      }
      throw error;
    }
  }

  public getAgent(name: string): AgentExecutor | undefined {
    return this.agents.get(name);
  }

  public getAgents(): AgentExecutor[] {
    return Array.from(this.agents.values());
  }

  public getAgentConfig(name: string): AgentConfig | undefined {
    return this.configs.get(name);
  }

  public getAgentStats(name: string): AgentStats | undefined {
    return this.stats.get(name);
  }

  public getAllStats(): Record<string, AgentStats> {
    return Object.fromEntries(this.stats.entries());
  }

  public async execute(
    agentName: string,
    input: string,
    context?: Record<string, any>
  ): Promise<any> {
    try {
      const agent = this.agents.get(agentName);
      if (!agent) {
        throw new Error(`Agent ${agentName} not found`);
      }

      const stats = this.stats.get(agentName)!;
      const startTime = Date.now();
      stats.executions++;
      stats.lastUsed = startTime;

      try {
        // 执行代理
        const result = await agent.call({
          input,
          ...context
        });

        // 更新统计信息
        const duration = Date.now() - startTime;
        stats.avgDuration = (stats.avgDuration * (stats.executions - 1) + duration) / stats.executions;
        stats.successRate = (stats.successRate * (stats.executions - 1) + 1) / stats.executions;
        if (result.intermediateSteps) {
          stats.avgSteps = (stats.avgSteps * (stats.executions - 1) + result.intermediateSteps.length) / stats.executions;
        }

        this.emit('agentSuccess', {
          name: agentName,
          duration,
          input,
          output: result.output,
          steps: result.intermediateSteps
        });

        return result;
      } catch (error) {
        stats.errors++;
        stats.successRate = (stats.successRate * (stats.executions - 1)) / stats.executions;

        if (error instanceof Error) {
          this.emit('agentError', {
            name: agentName,
            error: error.message,
            input
          });
          logger.error('Agent', `Agent ${agentName} execution failed: ${error.message}`);
          throw error;
        }
        throw new Error('Unknown error during agent execution');
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Agent', `Failed to execute agent ${agentName}: ${error.message}`);
      }
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      // 清理所有代理
      for (const [name, agent] of this.agents.entries()) {
        if (agent.memory) {
          await agent.memory.clear();
        }
        this.agents.delete(name);
      }

      this.configs.clear();
      this.stats.clear();
      this.model = undefined;
      this.removeAllListeners();
      logger.info('Agent', 'Agent manager shut down');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Agent', `Failed to shutdown agent manager: ${error.message}`);
      }
      throw error;
    }
  }
} 