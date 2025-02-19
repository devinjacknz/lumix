import { ChainType } from '@lumix/types';
import { TransactionEngine } from './engine';
import { TransactionError } from './errors';
import { TransactionEngineConfig } from './types';

// Re-export all types
export * from './types';
export * from './errors';

// Export the default configuration
export const defaultConfig: TransactionEngineConfig = {
  maxConcurrent: 10,
  timeout: 5 * 60 * 1000, // 5 minutes
  maxRetries: 3,
  confirmationBlocks: {
    SOLANA: 32,
    ETHEREUM: 12,
    BASE: 12
  },
  minGasPrice: {
    SOLANA: '0',
    ETHEREUM: '1000000000', // 1 Gwei
    BASE: '100000000' // 0.1 Gwei
  },
  maxGasPrice: {
    SOLANA: '100000',
    ETHEREUM: '100000000000', // 100 Gwei
    BASE: '10000000000' // 10 Gwei
  },
  defaultGasLimit: {
    SOLANA: '200000',
    ETHEREUM: '21000',
    BASE: '21000'
  }
};

// Export the engine and error types
export { TransactionEngine, TransactionError }; 