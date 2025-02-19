import { ChainProtocol } from '@lumix/types';

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
  name: string;
  version: string;
  description: string;
  author: string;
  permissions?: string[];
  dependencies?: Record<string, string>;
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
  verifySignature: boolean;
  autoEnable: boolean;
  allowHotReload: boolean;
  maxPlugins: number;
}

export interface Plugin {
  metadata: PluginMetadata;
  isEnabled: boolean;
  isLoaded: boolean;
  onLoad?(): Promise<void>;
  onEnable?(): Promise<void>;
  onDisable?(): Promise<void>;
  onUnload?(): Promise<void>;
  [key: string]: any;
}

export interface PluginConfig {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: Record<string, string>;
  permissions?: string[];
  config?: Record<string, any>;
}

export interface PluginStats {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  startTime?: number;
  stopTime?: number;
  error?: string;
  memoryUsage?: number;
  cpuUsage?: number;
  eventCount?: number;
  lastEventTime?: number;
}

export interface PluginHotReloadConfig {
  enabled: boolean;
  watchInterval: number;
  maxRetries: number;
  retryDelay: number;
}

export interface PluginValidationResult {
  valid: boolean;
  issues: string[];
} 