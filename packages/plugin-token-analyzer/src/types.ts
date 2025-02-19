import { Decimal } from 'decimal.js';
import { Wallet } from '@solana/wallet-adapter-base';

export interface TokenAnalyzerConfig {
  rpcUrl: string;
  apiEndpoint: string;
  wallet?: Wallet;
}

export interface PriceData {
  current: Decimal;
  change24h: Decimal;
  volume24h: Decimal;
  lastUpdate: string;
}

export interface TokenMetrics {
  address: string;
  supply: Decimal;
  holders: number;
  price: PriceData;
  marketCap: Decimal;
  timestamp: string;
}

export interface TokenHolding {
  token: string;
  balance: Decimal;
  decimals: number;
}

export interface TokenActivity {
  type: 'transfer' | 'mint' | 'burn' | 'approve';
  amount: Decimal;
  timestamp: string;
  signature: string;
  from: string;
  to: string;
}

export interface TokenDistribution {
  token: string;
  holders: {
    address: string;
    balance: Decimal;
    percentage: Decimal;
  }[];
  timestamp: string;
}

export interface TokenAnalysis {
  token: string;
  metrics: TokenMetrics;
  analysis: {
    concentration: {
      topHoldersPercentage: Decimal;
      holderCount: number;
      giniCoefficient: Decimal;
    };
    activity: {
      transferVolume: Decimal;
      uniqueSenders: number;
      uniqueReceivers: number;
    };
  };
  timestamp: string;
}
