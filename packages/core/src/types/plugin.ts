import { ChainType } from '@lumix/types';

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  repository?: string;
  dependencies?: Record<string, string>;
}

export interface PluginContext {
  config: Record<string, any>;
  logger: {
    debug: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
  };
}

export interface PluginAPI {
  registerHook: (hook: string, callback: Function) => void;
  unregisterHook: (hook: string, callback: Function) => void;
  emit: (event: string, data: any) => Promise<void>;
  on: (event: string, callback: Function) => void;
  off: (event: string, callback: Function) => void;
}

export interface PluginHooks {
  onInstall?: () => Promise<void>;
  onUninstall?: () => Promise<void>;
  onEnable?: () => Promise<void>;
  onDisable?: () => Promise<void>;
  onConfigChange?: (config: Record<string, any>) => Promise<void>;
}

export interface PluginUtils {
  formatPrice: (price: number | string, decimals?: number) => string;
  parsePrice: (price: string) => number;
  validateAddress: (chain: ChainType, address: string) => boolean;
  sleep: (ms: number) => Promise<void>;
}

export interface Plugin {
  metadata: PluginMetadata;
  context: PluginContext;
  api: PluginAPI;
  hooks: PluginHooks;
  utils: PluginUtils;
}

export interface PluginManager {
  install: (plugin: Plugin) => Promise<void>;
  uninstall: (pluginName: string) => Promise<void>;
  enable: (pluginName: string) => Promise<void>;
  disable: (pluginName: string) => Promise<void>;
  getPlugin: (pluginName: string) => Plugin | undefined;
  listPlugins: () => Plugin[];
  updateConfig: (pluginName: string, config: Record<string, any>) => Promise<void>;
} 