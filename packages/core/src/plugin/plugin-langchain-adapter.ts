import { Tool, StructuredTool } from '@langchain/core/tools';
import { Plugin } from './types';
import { logger } from '../monitoring';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { AgentExecutor, initializeAgentExecutorWithOptions } from 'langchain/agents';
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { BaseMemory } from "langchain/memory";
import { z } from 'zod';

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
  type: 'zero-shot-react-description' | 'chat-zero-shot-react-description' | 'chat-conversational-react-description';
  maxIterations?: number;
  returnIntermediateSteps?: boolean;
  earlyStoppingMethod?: 'force' | 'generate';
  memory?: BaseMemory;
}

export interface LangChainConfig {
  type: 'zero-shot-react-description' | 'chat-zero-shot-react-description' | 'chat-conversational-react-description';
  name: string;
  description: string;
  returnDirect?: boolean;
  verbose?: boolean;
}

class PluginTool extends StructuredTool {
  name: string;
  description: string;
  private plugin: Plugin;
  private methodName: string;
  private parameters: Record<string, any>;

  constructor(
    plugin: Plugin,
    config: PluginToolConfig
  ) {
    super();
    this.name = config.name;
    this.description = config.description;
    this.plugin = plugin;
    this.methodName = config.method;
    this.parameters = config.parameters || {};

    // Initialize schema after parameters are set
    this.schema = z.object({
      input: z.string().optional(),
      ...Object.entries(this.parameters).reduce((acc, [key, value]) => ({
        ...acc,
        [key]: z.any()
      }), {})
    });
  }

  protected async _call(
    input: string,
    runManager?: CallbackManagerForToolRun
  ): Promise<string> {
    try {
      const result = await this.plugin[this.methodName](
        ...this.parseToolInput(input, this.parameters)
      );
      return JSON.stringify(result);
    } catch (error) {
      logger.error('Plugin Tool', `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      const tool = new PluginTool(plugin, config);
      this.tools.set(config.name, tool);
      return tool;
    } catch (error) {
      logger.error('Plugin Tool', `Failed to create tool from plugin: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

      this.agents.set(config.name, agent);
      return agent;
    } catch (error) {
      logger.error('Plugin Agent', `Failed to create agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
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