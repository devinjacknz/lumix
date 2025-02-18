export * from './types';
export * from './crypto';
export * from './key-manager';

// 导出密钥管理器单例
import { KeyManager } from './key-manager';
export const keyManager = KeyManager.getInstance(); 