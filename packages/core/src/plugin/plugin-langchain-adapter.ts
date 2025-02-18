import { Tool } from "langchain/tools";
import { Plugin } from './types';
import { logger } from '../monitoring';
import { BaseLanguageModel } from "langchain/base_language";
import { AgentExecutor } from "langchain/agents";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { BaseMemory } from "langchain/memory";

export interface PluginToolConfig {
  name: string;
  description: string;
  method: string;
  parameters?: Record<string, any>;
  returnSchema?: Record<string, any>;
  timeout?: number;
}

export interface AgentConfig {
  name: string;
  description: string;
  type: 'zero-shot' | 'structured' | 'conversational';
  maxIterations?: number;
  returnIntermediateSteps?: boolean;
  earlyStoppingMethod?: 'force' | 'generate';
  memory?: BaseMemory;
}

export class PluginLangChainAdapter {
  private static instance: PluginLangChainAdapter;
  private tools: Map<string, Tool>;
  private agents: Map<string, AgentExecutor>;
  private model?: BaseLanguageModel;

  private constructor() {
    this.tools = new Map();
    this.agents = new Map();
  }

  public static getInstance(): PluginLangChainAdapter {
    if (!PluginLangChainAdapter.instance) {
      PluginLangChainAdapter.instance = new PluginLangChainAdapter();
    }
    return PluginLangChainAdapter.instance;
  }

  public setModel(model: BaseLanguageModel): void {
    this.model = model;
    // 更新所有代理的模型
    this.agents.forEach(agent => {
      agent.llmChain.llm = model;
    });
  }

  public async createToolFromPlugin(
    plugin: Plugin,
    config: PluginToolConfig
  ): Promise<Tool> {
    try {
      // 创建 LangChain 工具
      const tool = new Tool({
        name: config.name,
        description: config.description,
        func: async (input: string) => {
          try {
            // 调用插件方法
            const result = await plugin[config.method](
              ...this.parseToolInput(input, config.parameters)
            );
            return JSON.stringify(result);
          } catch (error) {
            if (error instanceof Error) {
              logger.error('Plugin Tool', `Tool execution failed: ${error.message}`);
            }
            throw error;
          }
        },
      });

      // 存储工具
      this.tools.set(config.name, tool);
      return tool;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Plugin Tool', `Failed to create tool from plugin: ${error.message}`);
      }
      throw error;
    }
  }

  public async createAgentFromTools(
    config: AgentConfig,
    tools: Tool[]
  ): Promise<AgentExecutor> {
    try {
      if (!this.model) {
        throw new Error('Language model not set');
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

      // 存储代理
      this.agents.set(config.name, agent);
      return agent;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Plugin Agent', `Failed to create agent: ${error.message}`);
      }
      throw error;
    }
  }

  private parseToolInput(input: string, parameters?: Record<string, any>): any[] {
    try {
      if (!parameters) return [input];
      
      const parsedInput = JSON.parse(input);
      return Object.keys(parameters).map(key => parsedInput[key]);
    } catch (error) {
      return [input];
    }
  }

  public getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  public getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  public getAgent(name: string): AgentExecutor | undefined {
    return this.agents.get(name);
  }

  public getAgents(): AgentExecutor[] {
    return Array.from(this.agents.values());
  }
} 