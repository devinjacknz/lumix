import { BaseConfig } from './base';

export interface PluginConfig extends BaseConfig {
  name: string;
  version: string;
  enabled?: boolean;
  dependencies?: string[];
}

export interface Plugin {
  name: string;
  version: string;
  metadata: PluginMetadata;
  initialize(options: PluginOptions): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface PluginMetadata {
  name: string;
  version: string;
  author?: string;
  description?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  dependencies?: string[];
  tags?: string[];
}

export interface PluginOptions {
  config?: Record<string, any>;
  hooks?: PluginHooks;
  state?: PluginState;
}

export interface PluginHooks {
  onInitialize?: () => Promise<void>;
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onError?: (error: PluginError) => Promise<void>;
}

export interface PluginState {
  isEnabled: boolean;
  isInitialized: boolean;
  isRunning: boolean;
  lastError?: PluginError;
  startTime?: number;
  stopTime?: number;
}

export interface PluginError {
  code: string;
  message: string;
  plugin: string;
  timestamp: number;
  details?: Record<string, any>;
}
