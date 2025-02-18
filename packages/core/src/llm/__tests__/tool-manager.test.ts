import { Tool } from "langchain/tools";
import { ToolManager, ToolConfig } from '../tool-manager';
import { BaseLanguageModel } from "langchain/base_language";

class MockTool extends Tool {
  name = 'mock-tool';
  description = 'A mock tool for testing';
  
  async _call(input: string): Promise<string> {
    return `Processed: ${input}`;
  }
}

class SlowMockTool extends Tool {
  name = 'slow-mock-tool';
  description = 'A slow mock tool for testing';
  
  async _call(input: string): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return `Slowly processed: ${input}`;
  }
}

class ErrorMockTool extends Tool {
  name = 'error-mock-tool';
  description = 'A mock tool that throws errors';
  
  async _call(input: string): Promise<string> {
    throw new Error('Mock error');
  }
}

describe('ToolManager', () => {
  let toolManager: ToolManager;
  let mockTool: Tool;
  let mockConfig: ToolConfig;

  beforeEach(() => {
    toolManager = ToolManager.getInstance();
    mockTool = new MockTool();
    mockConfig = {
      name: mockTool.name,
      description: mockTool.description,
      enabled: true
    };
  });

  afterEach(async () => {
    await toolManager.shutdown();
  });

  describe('Tool Registration', () => {
    it('should register a tool', () => {
      toolManager.registerTool(mockTool, mockConfig);
      const registeredTool = toolManager.getTool(mockTool.name);
      expect(registeredTool).toBeDefined();
      expect(registeredTool?.name).toBe(mockTool.name);
    });

    it('should not register duplicate tools', () => {
      toolManager.registerTool(mockTool, mockConfig);
      expect(() => toolManager.registerTool(mockTool, mockConfig)).toThrow();
    });

    it('should unregister a tool', () => {
      toolManager.registerTool(mockTool, mockConfig);
      toolManager.unregisterTool(mockTool.name);
      expect(toolManager.getTool(mockTool.name)).toBeUndefined();
    });

    it('should get all registered tools', () => {
      toolManager.registerTool(mockTool, mockConfig);
      const tools = toolManager.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe(mockTool.name);
    });

    it('should get only enabled tools', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      toolManager.registerTool(mockTool, disabledConfig);
      const enabledTools = toolManager.getEnabledTools();
      expect(enabledTools).toHaveLength(0);
    });
  });

  describe('Tool Execution', () => {
    it('should execute a tool successfully', async () => {
      toolManager.registerTool(mockTool, mockConfig);
      const tool = toolManager.getTool(mockTool.name)!;
      const result = await tool.call('test input');
      expect(result).toBe('Processed: test input');
    });

    it('should handle tool execution errors', async () => {
      const errorTool = new ErrorMockTool();
      toolManager.registerTool(errorTool, {
        name: errorTool.name,
        description: errorTool.description,
        enabled: true
      });

      const tool = toolManager.getTool(errorTool.name)!;
      await expect(tool.call('test input')).rejects.toThrow('Mock error');
    });

    it('should respect tool timeout', async () => {
      const slowTool = new SlowMockTool();
      toolManager.registerTool(slowTool, {
        name: slowTool.name,
        description: slowTool.description,
        enabled: true,
        timeout: 50
      });

      const tool = toolManager.getTool(slowTool.name)!;
      await expect(tool.call('test input')).rejects.toThrow('Tool execution timeout');
    });

    it('should handle rate limiting', async () => {
      const rateLimitedConfig = {
        ...mockConfig,
        rateLimit: {
          maxRequests: 2,
          interval: 1000
        }
      };

      toolManager.registerTool(mockTool, rateLimitedConfig);
      const tool = toolManager.getTool(mockTool.name)!;

      // First two calls should be immediate
      await tool.call('test1');
      await tool.call('test2');

      const startTime = Date.now();
      await tool.call('test3');
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Tool Statistics', () => {
    it('should track tool usage statistics', async () => {
      toolManager.registerTool(mockTool, mockConfig);
      const tool = toolManager.getTool(mockTool.name)!;

      await tool.call('test input');
      const stats = toolManager.getToolStats(mockTool.name);

      expect(stats).toBeDefined();
      expect(stats?.calls).toBe(1);
      expect(stats?.errors).toBe(0);
      expect(stats?.successRate).toBe(1);
    });

    it('should track error statistics', async () => {
      const errorTool = new ErrorMockTool();
      toolManager.registerTool(errorTool, {
        name: errorTool.name,
        description: errorTool.description,
        enabled: true
      });

      const tool = toolManager.getTool(errorTool.name)!;
      try {
        await tool.call('test input');
      } catch {}

      const stats = toolManager.getToolStats(errorTool.name);
      expect(stats?.errors).toBe(1);
      expect(stats?.successRate).toBe(0);
    });

    it('should calculate average latency', async () => {
      const slowTool = new SlowMockTool();
      toolManager.registerTool(slowTool, {
        name: slowTool.name,
        description: slowTool.description,
        enabled: true
      });

      const tool = toolManager.getTool(slowTool.name)!;
      await tool.call('test input');

      const stats = toolManager.getToolStats(slowTool.name);
      expect(stats?.avgLatency).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Event Emission', () => {
    it('should emit events on tool registration', () => {
      const handler = jest.fn();
      toolManager.on('toolRegistered', handler);
      toolManager.registerTool(mockTool, mockConfig);
      expect(handler).toHaveBeenCalledWith({ name: mockTool.name, config: mockConfig });
    });

    it('should emit events on tool unregistration', () => {
      const handler = jest.fn();
      toolManager.registerTool(mockTool, mockConfig);
      toolManager.on('toolUnregistered', handler);
      toolManager.unregisterTool(mockTool.name);
      expect(handler).toHaveBeenCalledWith({ name: mockTool.name });
    });

    it('should emit events on tool success', async () => {
      const handler = jest.fn();
      toolManager.registerTool(mockTool, mockConfig);
      toolManager.on('toolSuccess', handler);
      const tool = toolManager.getTool(mockTool.name)!;
      await tool.call('test input');
      expect(handler).toHaveBeenCalled();
    });

    it('should emit events on tool error', async () => {
      const handler = jest.fn();
      const errorTool = new ErrorMockTool();
      toolManager.registerTool(errorTool, {
        name: errorTool.name,
        description: errorTool.description,
        enabled: true
      });
      toolManager.on('toolError', handler);
      const tool = toolManager.getTool(errorTool.name)!;
      try {
        await tool.call('test input');
      } catch {}
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Model Integration', () => {
    it('should set and use language model', () => {
      const mockModel = {} as BaseLanguageModel;
      toolManager.setModel(mockModel);
      // 这里可以添加更多测试来验证模型集成
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tool configurations', () => {
      const invalidConfig = {
        ...mockConfig,
        name: 'different-name' // 名称不匹配
      };
      expect(() => toolManager.registerTool(mockTool, invalidConfig)).toThrow();
    });

    it('should handle missing tool configurations', () => {
      const tool = toolManager.getTool('non-existent');
      expect(tool).toBeUndefined();
    });
  });
}); 