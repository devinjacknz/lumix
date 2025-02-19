export interface PluginConfig {
  name: string;
  version: string;
  enabled: boolean;
  [key: string]: any;
}

export interface Plugin {
  initialize(config: PluginConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
