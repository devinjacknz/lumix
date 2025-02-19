import { BaseError } from '../types/errors';

// 定义 ConfigError
export class ConfigError extends BaseError {
  constructor(message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'ConfigError';
  }
}

export * from './types';
export * from './config-manager';

// 导出配置管理器单例
import { ConfigManager } from './config-manager';
export const configManager = ConfigManager.getInstance(); 