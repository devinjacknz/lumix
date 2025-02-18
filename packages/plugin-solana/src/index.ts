import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddressSync, getMint } from '@solana/spl-token';
import BN from 'bn.js';
import Decimal from 'decimal.js';

export interface SolanaConfig {
  rpcEndpoint: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export class SolanaPlugin {
  private connection: Connection;

  constructor(config: SolanaConfig) {
    this.connection = new Connection(config.rpcEndpoint, {
      commitment: config.commitment || 'confirmed'
    });
  }

  async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<Decimal> {
    const tokenPublicKey = new PublicKey(tokenAddress);
    const walletPublicKey = new PublicKey(walletAddress);
    const associatedTokenAddress = getAssociatedTokenAddressSync(tokenPublicKey, walletPublicKey);
    
    const account = await getAccount(this.connection, associatedTokenAddress);
    return new Decimal(account.amount.toString());
  }

  async getTokenSupply(tokenAddress: string): Promise<Decimal> {
    const tokenPublicKey = new PublicKey(tokenAddress);
    const mint = await getMint(this.connection, tokenPublicKey);
    return new Decimal(mint.supply.toString());
  }
}

// 选择性导出需要的类型，避免重复导出
export { 
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';

export {
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
