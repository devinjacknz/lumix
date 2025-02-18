import { PublicKey, Signer } from '@solana/web3.js';
import { Decimal } from 'decimal.js';
import BN from 'bn.js';

export interface StrategyConfig {
  rpcUrl: string;
  marketAddress: string;
  programId: PublicKey;
  walletAddress: string;
  wallet: Signer;
}

export interface SwapParams {
  inputToken: string;
  outputToken: string;
  amount: string | number | BN;
  slippage: number;
}

export interface LiquidityParams {
  tokenA: string;
  tokenB: string;
  amountA: string | number | BN;
  amountB: string | number | BN;
}

export interface Position {
  token: string;
  balance: Decimal;
  lastUpdate: string;
}

export interface StrategyState {
  positions: Position[];
  lastUpdate: string;
  marketAddress: string;
}

export { Market, Liquidity, PoolKeys } from '@raydium-io/raydium-sdk';

export interface LiquidityUserKeys {
  owner: PublicKey;
  baseTokenAccount: PublicKey;
  quoteTokenAccount: PublicKey;
  lpTokenAccount: PublicKey;
}

export interface StrategyError {
  code: string;
  message: string;
  details?: unknown;
}

export interface StrategyResponse<T> {
  success: boolean;
  data?: T;
  error?: StrategyError;
}
