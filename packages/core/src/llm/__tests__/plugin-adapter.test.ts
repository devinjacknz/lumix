import { Plugin, PluginAPI } from '../../plugin/plugin-manager';
import { PluginAdapter, PluginTool, PluginToolConfig } from '../plugin-adapter';

class MockPlugin implements Plugin {
  private api: PluginAPI = {
    testMethod: async (params: any) => `Processed: ${JSON.stringify(params)}`,
    errorMethod: async () => { throw new Error('Mock error'); },
    slowMethod: async (params: any) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return `Slowly processed: ${JSON.stringify(params)}`;
    }
  };

  getName(): string {
    return 'mock-plugin';
  }

  getAPI(): PluginAPI {
    return this.api;
  }
}

describe('PluginAdapter', () => {
  let pluginAdapter: PluginAdapter;
  let mockPlugin: Plugin;
  let mockConfig: PluginToolConfig;

  beforeEach(() => {
    pluginAdapter = PluginAdapter.getInstance();
    mockPlugin = new MockPlugin();
    mockConfig = {
      name: 'test-tool',
      description: 'Test tool',
      method: 'testMethod'
    };
  });

  afterEach(async () => {
    await pluginAdapter.shutdown();
  });

  describe('Tool Creation', () => {
    it('should create a tool from plugin', () => {
      const tool = pluginAdapter.createTool(mockPlugin, mockConfig);
      expect(tool).toBeInstanceOf(PluginTool);
      expect(tool.name).toBe(mockConfig.name);
    });

    it('should not create duplicate tools', () => {
      pluginAdapter.createTool(mockPlugin, mockConfig);
      expect(() => pluginAdapter.createTool(mockPlugin, mockConfig)).toThrow();
    });

    it('should validate plugin method', () => {
      const invalidConfig = {
        ...mockConfig,
        method: 'nonexistentMethod'
      };
      expect(() => pluginAdapter.createTool(mockPlugin, invalidConfig)).toThrow();
    });

    it('should get created tool', () => {
      const tool = pluginAdapter.createTool(mockPlugin, mockConfig);
      const retrievedTool = pluginAdapter.getTool(mockPlugin.getName(), mockConfig.name);
      expect(retrievedTool).toBe(tool);
    });
  });

  describe('Tool Execution', () => {
    let tool: PluginTool;

    beforeEach(() => {
      tool = pluginAdapter.createTool(mockPlugin, mockConfig);
    });

    it('should execute tool with string input', async () => {
      const result = await tool.call('test input');
      expect(result).toContain('test input');
    });

    it('should execute tool with JSON input', async () => {
      const input = JSON.stringify({ key: 'value' });
      const result = await tool.call(input);
      expect(result).toContain('value');
    });

    it('should handle execution errors', async () => {
      const errorConfig = {
        ...mockConfig,
        name: 'error-tool',
        method: 'errorMethod'
      };
      const errorTool = pluginAdapter.createTool(mockPlugin, errorConfig);
      await expect(errorTool.call('test')).rejects.toThrow('Mock error');
    });

    it('should respect timeout', async () => {
      const slowConfig = {
        ...mockConfig,
        name: 'slow-tool',
        method: 'slowMethod',
        timeout: 50
      };
      const slowTool = pluginAdapter.createTool(mockPlugin, slowConfig);
      await expect(slowTool.call('test')).rejects.toThrow('Tool execution timeout');
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters', async () => {
      const configWithParams = {
        ...mockConfig,
        parameters: {
          required_param: { required: true }
        }
      };
      const tool = pluginAdapter.createTool(mockPlugin, configWithParams);
      await expect(tool.call('{}')).rejects.toThrow('Missing required parameter');
    });

    it('should accept valid parameters', async () => {
      const configWithParams = {
        ...mockConfig,
        parameters: {
          required_param: { required: true }
        }
      };
      const tool = pluginAdapter.createTool(mockPlugin, configWithParams);
      const input = JSON.stringify({ required_param: 'value' });
      await expect(tool.call(input)).resolves.toBeDefined();
    });
  });

  describe('Tool Management', () => {
    it('should list all tools', () => {
      pluginAdapter.createTool(mockPlugin, mockConfig);
      const tools = pluginAdapter.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe(mockConfig.name);
    });

    it('should delete specific tool', () => {
      pluginAdapter.createTool(mockPlugin, mockConfig);
      pluginAdapter.deleteTool(mockPlugin.getName(), mockConfig.name);
      expect(pluginAdapter.getTool(mockPlugin.getName(), mockConfig.name)).toBeUndefined();
    });

    it('should delete all tools for a plugin', () => {
      const configs = [
        mockConfig,
        { ...mockConfig, name: 'tool-2' },
        { ...mockConfig, name: 'tool-3' }
      ];

      configs.forEach(config => pluginAdapter.createTool(mockPlugin, config));
      pluginAdapter.deletePluginTools(mockPlugin.getName());

      configs.forEach(config => {
        expect(pluginAdapter.getTool(mockPlugin.getName(), config.name)).toBeUndefined();
      });
    });
  });

  describe('Result Formatting', () => {
    it('should format string results', async () => {
      const tool = pluginAdapter.createTool(mockPlugin, mockConfig);
      const result = await tool.call('test');
      expect(typeof result).toBe('string');
    });

    it('should format object results', async () => {
      const tool = pluginAdapter.createTool(mockPlugin, {
        ...mockConfig,
        method: 'testMethod'
      });
      const input = JSON.stringify({ key: 'value' });
      const result = await tool.call(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON input', async () => {
      const tool = pluginAdapter.createTool(mockPlugin, mockConfig);
      const invalidJson = '{invalid:json}';
      await expect(tool.call(invalidJson)).resolves.toBeDefined();
    });

    it('should handle plugin API errors', async () => {
      const errorConfig = {
        ...mockConfig,
        method: 'errorMethod'
      };
      const tool = pluginAdapter.createTool(mockPlugin, errorConfig);
      await expect(tool.call('test')).rejects.toThrow();
    });

    it('should handle shutdown errors', async () => {
      // 模拟清理错误
      jest.spyOn(Map.prototype, 'clear').mockImplementation(() => {
        throw new Error('Clear error');
      });

      await expect(pluginAdapter.shutdown()).rejects.toThrow();

      // 恢复原始实现
      jest.restoreAllMocks();
    });
  });

  describe('Performance', () => {
    it('should handle concurrent executions', async () => {
      const tool = pluginAdapter.createTool(mockPlugin, mockConfig);
      const executions = Array.from({ length: 10 }, () => 
        tool.call('test input')
      );

      const results = await Promise.all(executions);
      expect(results).toHaveLength(10);
    });

    it('should maintain performance with many tools', () => {
      const tools = Array.from({ length: 100 }, (_, i) => ({
        ...mockConfig,
        name: `tool-${i}`
      }));

      const startTime = Date.now();
      tools.forEach(config => pluginAdapter.createTool(mockPlugin, config));
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // 应该在1秒内完成
    });
  });
}); 