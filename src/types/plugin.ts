import { ChainType } from './chain';

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  dependencies?: string[];
}

export interface PluginContext {
  config: Record<string, any>;
  logger: any; // TODO: Add proper logger type
  messaging: any; // TODO: Add proper messaging type
}

export interface PluginAPI {
  [key: string]: any;
}

export interface PluginHooks {
  onInstall?: () => Promise<void>;
  onUninstall?: () => Promise<void>;
  onEnable?: () => Promise<void>;
  onDisable?: () => Promise<void>;
}

export interface PluginUtils {
  [key: string]: any;
}

export interface Plugin {
  metadata: PluginMetadata;
  context: PluginContext;
  api: PluginAPI;
  hooks: PluginHooks;
  utils: PluginUtils;
}

export class PluginManager {
  private plugins: Map<string, Plugin>;

  constructor() {
    this.plugins = new Map();
  }

  async install(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.metadata.name)) {
      throw new Error(`Plugin ${plugin.metadata.name} is already installed`);
    }

    if (plugin.hooks.onInstall) {
      await plugin.hooks.onInstall();
    }

    this.plugins.set(plugin.metadata.name, plugin);
  }

  async uninstall(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} is not installed`);
    }

    if (plugin.hooks.onUninstall) {
      await plugin.hooks.onUninstall();
    }

    this.plugins.delete(name);
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }
}

export default PluginManager; 