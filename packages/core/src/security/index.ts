export * from './types';
export * from './crypto';
export * from './key-manager';
export * from './emergency-handler';
export * from './mev-guard';
export * from './risk-assessor';
export * from './transaction-monitor';

// 导出密钥管理器单例
import { KeyManager } from './key-manager';
export const keyManager = KeyManager.getInstance();

import { EmergencyHandler } from './emergency-handler';
import { MEVGuard } from './mev-guard';
import { RiskAssessor } from './risk-assessor';
import { TransactionMonitor } from './transaction-monitor';

export {
  EmergencyHandler,
  MEVGuard,
  RiskAssessor,
  TransactionMonitor
}; 