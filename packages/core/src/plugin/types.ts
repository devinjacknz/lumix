export interface PluginAPI {
  [key: string]: (...args: any[]) => Promise<any>;
}

export interface Plugin extends PluginLifecycle {
  getName(): string;
  getAPI(): PluginAPI;
  isEnabled: boolean;
  isLoaded: boolean;
}

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  dependencies?: Record<string, string>;
  chainSupport?: string[];
  permissions?: string[];
  config?: Record<string, any>;
  [key: string]: any;
}

export interface PluginLifecycle {
  onLoad?(): Promise<void>;
  onUnload?(): Promise<void>;
  onEnable?(): Promise<void>;
  onDisable?(): Promise<void>;
  onConfigChange?(newConfig: any): Promise<void>;
}

export interface PluginVerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PluginManagerConfig {
  pluginDir: string;
  verifySignature?: boolean;
  autoEnable?: boolean;
  allowHotReload?: boolean;
  maxPlugins?: number;
  [key: string]: any;
} 