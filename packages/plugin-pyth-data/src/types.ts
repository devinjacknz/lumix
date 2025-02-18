import { PublicKey } from '@solana/web3.js';
import { Decimal } from 'decimal.js';
import { Price, Product } from '@pythnetwork/client';

export type PythPriceCallback = (price: Price, product: Product) => void;

export interface PythConfig {
  rpcUrl: string;
  apiEndpoint: string;
  commitment?: string;
}

export interface PriceData {
  symbol: string;
  price: Decimal;
  confidence: Decimal;
  timestamp: string;
}

export interface PriceHistory {
  symbol: string;
  prices: PriceData[];
}

export interface PythFeed {
  symbol: string;
  priceAccount: PublicKey;
  price: Decimal;
  confidence: Decimal;
}

export interface PythSubscription {
  unsubscribe: () => void;
}

export interface PythResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PriceUpdate {
  price: number;
  confidence: number;
  publishSlot: number;
}

export interface PythPriceStatus {
  symbol: string;
  status: 'active' | 'inactive';
  lastUpdate: string;
  errorCount?: number;
}

export interface PythMetrics {
  totalFeeds: number;
  activeFeeds: number;
  updateFrequency: number;
  lastUpdate: string;
}
