export enum TransactionType {
  BUY = 'buy',
  SELL = 'sell',
  TRANSFER = 'transfer',
  SWAP = 'swap'
}

export interface TransactionConfig {
  type: TransactionType;
  amount: string;
  asset: string;
  chain: string;
}

export interface TransactionResult {
  success: boolean;
  hash?: string;
  error?: string;
}
