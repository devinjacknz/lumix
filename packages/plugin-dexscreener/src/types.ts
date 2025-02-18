import { Decimal } from 'decimal.js';

export interface DexScreenerConfig {
  apiEndpoint: string;
  wsEndpoint: string;
  reconnectInterval?: number;
}

export interface PairInfo {
  address: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  price: Decimal;
  volume24h: Decimal;
  liquidity: Decimal;
  priceChange: {
    h1: number;
    h24: number;
    d7: number;
  };
  createdAt: string;
  dexId: string;
}

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  price: Decimal;
  volume24h: Decimal;
  marketCap: Decimal;
  pairs: PairInfo[];
  priceChange: {
    h1: number;
    h24: number;
    d7: number;
  };
}

export interface PriceUpdate {
  pair: string;
  price: Decimal;
  timestamp: string;
}

export interface MarketStats {
  totalPairs: number;
  totalVolume24h: Decimal;
  totalLiquidity: Decimal;
  topPairs: PairInfo[];
  lastUpdate: string;
}

export interface DexScreenerResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface WebSocketMessage {
  type: 'price' | 'subscribe' | 'unsubscribe';
  pair: string;
  data?: {
    price: string;
    timestamp: number;
  };
}

export interface PairStats {
  h1: {
    volume: Decimal;
    trades: number;
  };
  h24: {
    volume: Decimal;
    trades: number;
  };
  d7: {
    volume: Decimal;
    trades: number;
  };
}

export interface DexInfo {
  id: string;
  name: string;
  url: string;
  pairCount: number;
  volume24h: Decimal;
}
