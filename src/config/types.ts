import { ChainType } from '@lumix/types';

// Re-export ChainType
export type { ChainType };

export interface TokenConfig {
  address: string;
  decimals: number;
  symbol: string;
}

// ... existing code ...