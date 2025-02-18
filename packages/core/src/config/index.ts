export * from './types';
export * from './config-manager';

// 导出配置管理器单例
import { ConfigManager } from './config-manager';
export const configManager = ConfigManager.getInstance(); 