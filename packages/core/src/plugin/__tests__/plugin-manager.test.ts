import { PluginManager } from '../plugin-manager';
import {
  Plugin,
  PluginAPI,
  PluginMetadata,
  PluginManagerConfig
} from '../types';
import * as path from 'path';
import * as fs from 'fs';

class MockPlugin implements Plugin {
  public isEnabled = false;
  public isLoaded = false;
  private metadata: PluginMetadata = {
    id: 'mock-plugin',
    name: 'Mock Plugin',
    version: '1.0.0',
    description: 'A mock plugin for testing',
    author: 'Test Author'
  };

  private api: PluginAPI = {
    testMethod: async (params: any) => `Processed: ${JSON.stringify(params)}`,
    errorMethod: async () => { throw new Error('Mock error'); }
  };

  getName(): string {
    return this.metadata.id;
  }

  getAPI(): PluginAPI {
    return this.api;
  }

  getMetadata(): PluginMetadata {
    return this.metadata;
  }

  async onLoad(): Promise<void> {
    this.isLoaded = true;
  }

  async onUnload(): Promise<void> {
    this.isLoaded = false;
  }

  async onEnable(): Promise<void> {
    this.isEnabled = true;
  }

  async onDisable(): Promise<void> {
    this.isEnabled = false;
  }
}

describe('PluginManager', () => {
  let pluginManager: PluginManager;
  let pluginDir: string;

  beforeEach(() => {
    pluginDir = path.join(__dirname, 'test-plugins');
    if (!fs.existsSync(pluginDir)) {
      fs.mkdirSync(pluginDir, { recursive: true });
    }

    pluginManager = new PluginManager(pluginDir, {
      verifySignature: false,
      autoEnable: true
    });
  });

  afterEach(async () => {
    await pluginManager.shutdown();
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true });
    }
  });

  describe('Plugin Loading', () => {
    it('should load a plugin', async () => {
      // 创建测试插件文件
      const pluginFile = path.join(pluginDir, 'mock-plugin.js');
      fs.writeFileSync(pluginFile, `
        const MockPlugin = ${MockPlugin.toString()};
        module.exports = { default: MockPlugin };
      `);

      await pluginManager.loadPlugin('mock-plugin.js');
      const plugin = pluginManager.getPlugin('mock-plugin');
      
      expect(plugin).toBeDefined();
      expect(plugin?.isLoaded).toBe(true);
      expect(plugin?.isEnabled).toBe(true);
    });

    it('should not load duplicate plugins', async () => {
      const pluginFile = path.join(pluginDir, 'mock-plugin.js');
      fs.writeFileSync(pluginFile, `
        const MockPlugin = ${MockPlugin.toString()};
        module.exports = { default: MockPlugin };
      `);

      await pluginManager.loadPlugin('mock-plugin.js');
      await expect(pluginManager.loadPlugin('mock-plugin.js')).rejects.toThrow();
    });

    it('should handle invalid plugin files', async () => {
      const invalidFile = path.join(pluginDir, 'invalid.js');
      fs.writeFileSync(invalidFile, 'invalid javascript');

      await expect(pluginManager.loadPlugin('invalid.js')).rejects.toThrow();
    });
  });

  describe('Plugin Lifecycle', () => {
    let plugin: MockPlugin;
    let pluginFile: string;

    beforeEach(() => {
      plugin = new MockPlugin();
      pluginFile = path.join(pluginDir, 'mock-plugin.js');
      fs.writeFileSync(pluginFile, `
        const MockPlugin = ${MockPlugin.toString()};
        module.exports = { default: MockPlugin };
      `);
    });

    it('should call lifecycle methods in correct order', async () => {
      await pluginManager.loadPlugin('mock-plugin.js');
      const loadedPlugin = pluginManager.getPlugin('mock-plugin');
      
      expect(loadedPlugin?.isLoaded).toBe(true);
      expect(loadedPlugin?.isEnabled).toBe(true);

      await pluginManager.unloadPlugin('mock-plugin');
      expect(pluginManager.getPlugin('mock-plugin')).toBeUndefined();
    });

    it('should handle lifecycle method errors', async () => {
      class ErrorPlugin extends MockPlugin {
        async onLoad(): Promise<void> {
          throw new Error('Load error');
        }
      }

      const errorFile = path.join(pluginDir, 'error-plugin.js');
      fs.writeFileSync(errorFile, `
        const ErrorPlugin = ${ErrorPlugin.toString()};
        module.exports = { default: ErrorPlugin };
      `);

      await expect(pluginManager.loadPlugin('error-plugin.js')).rejects.toThrow('Load error');
    });
  });

  describe('Plugin API', () => {
    let pluginFile: string;

    beforeEach(async () => {
      pluginFile = path.join(pluginDir, 'mock-plugin.js');
      fs.writeFileSync(pluginFile, `
        const MockPlugin = ${MockPlugin.toString()};
        module.exports = { default: MockPlugin };
      `);
      await pluginManager.loadPlugin('mock-plugin.js');
    });

    it('should access plugin API', async () => {
      const plugin = pluginManager.getPlugin('mock-plugin');
      const api = plugin?.getAPI();
      
      expect(api).toBeDefined();
      const result = await api?.testMethod({ test: 'data' });
      expect(result).toContain('test');
    });

    it('should handle API errors', async () => {
      const plugin = pluginManager.getPlugin('mock-plugin');
      const api = plugin?.getAPI();
      
      await expect(api?.errorMethod()).rejects.toThrow('Mock error');
    });
  });

  describe('Plugin Management', () => {
    it('should list all plugins', async () => {
      const pluginFile = path.join(pluginDir, 'mock-plugin.js');
      fs.writeFileSync(pluginFile, `
        const MockPlugin = ${MockPlugin.toString()};
        module.exports = { default: MockPlugin };
      `);

      await pluginManager.loadPlugin('mock-plugin.js');
      const plugins = pluginManager.getPlugins();
      
      expect(plugins).toHaveLength(1);
      expect(plugins[0].getName()).toBe('mock-plugin');
    });

    it('should handle plugin shutdown', async () => {
      const pluginFile = path.join(pluginDir, 'mock-plugin.js');
      fs.writeFileSync(pluginFile, `
        const MockPlugin = ${MockPlugin.toString()};
        module.exports = { default: MockPlugin };
      `);

      await pluginManager.loadPlugin('mock-plugin.js');
      await pluginManager.shutdown();
      
      const plugins = pluginManager.getPlugins();
      expect(plugins).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing plugin directory', () => {
      const invalidDir = path.join(__dirname, 'nonexistent');
      expect(() => new PluginManager(invalidDir)).not.toThrow();
    });

    it('should handle plugin verification errors', async () => {
      const manager = new PluginManager(pluginDir, {
        verifySignature: true
      });

      const pluginFile = path.join(pluginDir, 'mock-plugin.js');
      fs.writeFileSync(pluginFile, `
        const MockPlugin = ${MockPlugin.toString()};
        module.exports = { default: MockPlugin };
      `);

      await expect(manager.loadPlugin('mock-plugin.js')).rejects.toThrow();
    });
  });
}); 