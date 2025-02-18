import { Commitment, Signer } from '@solana/web3.js';
import { Decimal } from 'decimal.js';

export interface SolanaConfig {
  rpcUrl: string;
  commitment?: Commitment;
  wallet: Signer;
}

export interface TokenBalance {
  mint: string;
  address: string;
  amount: Decimal;
  decimals: number;
}

export interface TransferParams {
  from: string;
  to: string;
  amount: string | number;
}

export interface TransactionResult {
  signature: string;
  timestamp: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface TokenAccountInfo {
  mint: string;
  owner: string;
  amount: Decimal;
  delegate?: string;
  delegatedAmount?: Decimal;
  isFrozen: boolean;
}

export interface SolanaResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface SignatureStatus {
  slot: number;
  confirmations: number | null;
  err: any | null;
  confirmationStatus?: Commitment;
}
