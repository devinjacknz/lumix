import { ChainType } from '@lumix/types';

export const defaultConfig = {
  confirmationBlocks: {
    SOLANA: 1,
    ETHEREUM: 12,
    BASE: 12
  },
  minGasPrice: {
    SOLANA: '5000',
    ETHEREUM: '1000000000',
    BASE: '100000000'
  },
  maxGasPrice: {
    SOLANA: '50000',
    ETHEREUM: '100000000000',
    BASE: '10000000000'
  },
  defaultGasLimit: {
    SOLANA: '200000',
    ETHEREUM: '21000',
    BASE: '21000'
  }
};

export * from './engine';
export * from './types';
export * from './errors';

import { TransactionEngine } from './engine';
import { TransactionEngineConfig } from './types';

// 默认交易引擎配置
const defaultConfig: TransactionEngineConfig = {
  maxConcurrent: 10,
  timeout: 5 * 60 * 1000, // 5分钟
  maxRetries: 3,
};

// 导出交易引擎单例实例
export const transactionEngine = TransactionEngine.getInstance(defaultConfig); 