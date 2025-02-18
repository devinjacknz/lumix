import { AgentManager, AgentConfig } from '../agent-manager';
import { ToolManager } from '../tool-manager';
import { Tool } from "langchain/tools";
import { BaseLanguageModel } from "langchain/base_language";
import { BufferMemory } from "langchain/memory";

class MockTool extends Tool {
  name = 'mock-tool';
  description = 'A mock tool for testing';
  
  async _call(input: string): Promise<string> {
    return `Processed: ${input}`;
  }
}

class MockLanguageModel {
  async call(messages: any[]): Promise<any> {
    return {
      content: 'Mock response',
      usage: {
        totalTokens: 10
      }
    };
  }
}

describe('AgentManager', () => {
  let agentManager: AgentManager;
  let toolManager: ToolManager;
  let mockTool: Tool;
  let mockConfig: AgentConfig;
  let mockModel: BaseLanguageModel;

  beforeEach(() => {
    agentManager = AgentManager.getInstance();
    toolManager = ToolManager.getInstance();
    mockTool = new MockTool();
    mockConfig = {
      name: 'test-agent',
      description: 'Test agent',
      type: 'zero-shot'
    };
    mockModel = new MockLanguageModel() as unknown as BaseLanguageModel;

    // 注册工具
    toolManager.registerTool(mockTool, {
      name: mockTool.name,
      description: mockTool.description,
      enabled: true
    });

    // 设置模型
    agentManager.setModel(mockModel);
  });

  afterEach(async () => {
    await agentManager.shutdown();
    await toolManager.shutdown();
  });

  describe('Agent Creation', () => {
    it('should create an agent', async () => {
      await agentManager.createAgent(mockConfig);
      const agent = agentManager.getAgent(mockConfig.name);
      expect(agent).toBeDefined();
    });

    it('should not create duplicate agents', async () => {
      await agentManager.createAgent(mockConfig);
      await expect(agentManager.createAgent(mockConfig)).rejects.toThrow();
    });

    it('should require a language model', async () => {
      agentManager.setModel(undefined as any);
      await expect(agentManager.createAgent(mockConfig)).rejects.toThrow('Language model not set');
    });

    it('should require enabled tools', async () => {
      await toolManager.shutdown();
      await expect(agentManager.createAgent(mockConfig)).rejects.toThrow('No enabled tools available');
    });
  });

  describe('Agent Management', () => {
    beforeEach(async () => {
      await agentManager.createAgent(mockConfig);
    });

    it('should delete an agent', async () => {
      await agentManager.deleteAgent(mockConfig.name);
      expect(agentManager.getAgent(mockConfig.name)).toBeUndefined();
    });

    it('should get all agents', () => {
      const agents = agentManager.getAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0]).toBeDefined();
    });

    it('should get agent config', () => {
      const config = agentManager.getAgentConfig(mockConfig.name);
      expect(config).toEqual(mockConfig);
    });

    it('should get agent stats', () => {
      const stats = agentManager.getAgentStats(mockConfig.name);
      expect(stats).toBeDefined();
      expect(stats?.executions).toBe(0);
    });
  });

  describe('Agent Execution', () => {
    beforeEach(async () => {
      await agentManager.createAgent(mockConfig);
    });

    it('should execute an agent', async () => {
      const result = await agentManager.execute(mockConfig.name, 'test input');
      expect(result).toBeDefined();
    });

    it('should handle execution errors', async () => {
      const errorModel = {
        call: async () => { throw new Error('Mock error'); }
      } as unknown as BaseLanguageModel;

      agentManager.setModel(errorModel);
      await expect(agentManager.execute(mockConfig.name, 'test input')).rejects.toThrow();
    });

    it('should track execution statistics', async () => {
      await agentManager.execute(mockConfig.name, 'test input');
      const stats = agentManager.getAgentStats(mockConfig.name);
      
      expect(stats?.executions).toBe(1);
      expect(stats?.errors).toBe(0);
      expect(stats?.successRate).toBe(1);
    });

    it('should use provided context', async () => {
      const context = { key: 'value' };
      const result = await agentManager.execute(mockConfig.name, 'test input', context);
      expect(result).toBeDefined();
    });
  });

  describe('Memory Integration', () => {
    it('should use provided memory', async () => {
      const memory = new BufferMemory();
      const configWithMemory = {
        ...mockConfig,
        memory
      };

      await agentManager.createAgent(configWithMemory);
      await agentManager.execute(configWithMemory.name, 'test input');
      
      const memoryVariables = await memory.loadMemoryVariables({});
      expect(memoryVariables).toBeDefined();
    });
  });

  describe('Event Emission', () => {
    it('should emit events on agent creation', async () => {
      const handler = jest.fn();
      agentManager.on('agentCreated', handler);
      await agentManager.createAgent(mockConfig);
      expect(handler).toHaveBeenCalledWith({ name: mockConfig.name, config: mockConfig });
    });

    it('should emit events on agent deletion', async () => {
      const handler = jest.fn();
      await agentManager.createAgent(mockConfig);
      agentManager.on('agentDeleted', handler);
      await agentManager.deleteAgent(mockConfig.name);
      expect(handler).toHaveBeenCalledWith({ name: mockConfig.name });
    });

    it('should emit events on agent success', async () => {
      const handler = jest.fn();
      await agentManager.createAgent(mockConfig);
      agentManager.on('agentSuccess', handler);
      await agentManager.execute(mockConfig.name, 'test input');
      expect(handler).toHaveBeenCalled();
    });

    it('should emit events on agent error', async () => {
      const handler = jest.fn();
      const errorModel = {
        call: async () => { throw new Error('Mock error'); }
      } as unknown as BaseLanguageModel;

      await agentManager.createAgent(mockConfig);
      agentManager.setModel(errorModel);
      agentManager.on('agentError', handler);
      
      try {
        await agentManager.execute(mockConfig.name, 'test input');
      } catch {}
      
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing agents', async () => {
      await expect(agentManager.execute('non-existent', 'test')).rejects.toThrow();
    });

    it('should handle invalid configurations', async () => {
      const invalidConfig = {
        ...mockConfig,
        type: 'invalid-type' as any
      };
      await expect(agentManager.createAgent(invalidConfig)).rejects.toThrow();
    });

    it('should handle memory errors', async () => {
      const errorMemory = {
        clear: async () => { throw new Error('Memory error'); }
      } as any;

      const configWithMemory = {
        ...mockConfig,
        memory: errorMemory
      };

      await agentManager.createAgent(configWithMemory);
      await expect(agentManager.deleteAgent(configWithMemory.name)).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle concurrent executions', async () => {
      await agentManager.createAgent(mockConfig);
      
      const executions = Array.from({ length: 10 }, () => 
        agentManager.execute(mockConfig.name, 'test input')
      );

      const results = await Promise.all(executions);
      expect(results).toHaveLength(10);
    });

    it('should maintain performance with many agents', async () => {
      const agents = Array.from({ length: 10 }, (_, i) => ({
        ...mockConfig,
        name: `agent-${i}`
      }));

      const startTime = Date.now();
      await Promise.all(agents.map(config => agentManager.createAgent(config)));
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // 应该在5秒内完成
    });
  });
}); 