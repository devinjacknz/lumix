export * from './types';
export * from './engine';

import { TransactionEngine } from './engine';
import { TransactionEngineConfig } from './types';
import { ChainType } from '../config/types';

// 默认交易引擎配置
const defaultConfig: TransactionEngineConfig = {
  maxConcurrent: 10,
  confirmationBlocks: {
    solana: 32,
    ethereum: 12,
    base: 12
  },
  timeout: 5 * 60 * 1000, // 5分钟
  maxRetries: 3,
  minGasPrice: {
    solana: '5000',
    ethereum: '1000000000', // 1 Gwei
    base: '100000000'      // 0.1 Gwei
  },
  maxGasPrice: {
    solana: '50000',
    ethereum: '100000000000', // 100 Gwei
    base: '10000000000'      // 10 Gwei
  },
  defaultGasLimit: {
    solana: '200000',
    ethereum: '21000',        // 基础转账
    base: '21000'
  }
};

// 导出交易引擎单例实例
export const transactionEngine = TransactionEngine.getInstance(defaultConfig); 