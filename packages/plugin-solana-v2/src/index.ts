import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  sendAndConfirmTransaction,
  TransactionInstruction
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import { Decimal } from 'decimal.js';
import { SolanaConfig, TokenBalance, TransactionResult, TransferParams } from './types';

export class SolanaPlugin {
  private connection: Connection;
  private config: SolanaConfig;

  constructor(config: SolanaConfig) {
    this.connection = new Connection(config.rpcUrl, config.commitment);
    this.config = config;
  }

  /**
   * Get SOL balance for an address
   */
  async getSolBalance(address: string): Promise<Decimal> {
    const balance = await this.connection.getBalance(new PublicKey(address));
    return new Decimal(balance).div(1e9); // Convert lamports to SOL
  }

  /**
   * Get token balance for an address
   */
  async getTokenBalance(params: { address: string; mint: string }): Promise<TokenBalance> {
    const { address, mint } = params;
    const tokenAccount = await getAssociatedTokenAddress(
      new PublicKey(mint),
      new PublicKey(address)
    );

    try {
      const balance = await this.connection.getTokenAccountBalance(tokenAccount);
      return {
        mint,
        address: tokenAccount.toString(),
        amount: new Decimal(balance.value.amount),
        decimals: balance.value.decimals
      };
    } catch (error) {
      return {
        mint,
        address: tokenAccount.toString(),
        amount: new Decimal(0),
        decimals: 0
      };
    }
  }

  /**
   * Transfer SOL
   */
  async transferSol(params: TransferParams): Promise<TransactionResult> {
    const { from, to, amount } = params;
    const lamports = new Decimal(amount).mul(1e9).toNumber();

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(from),
        toPubkey: new PublicKey(to),
        lamports
      })
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.config.wallet]
    );

    return {
      signature,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Transfer SPL tokens
   */
  async transferToken(params: TransferParams & { mint: string }): Promise<TransactionResult> {
    const { from, to, amount, mint } = params;

    const fromPubkey = new PublicKey(from);
    const toPubkey = new PublicKey(to);
    const mintPubkey = new PublicKey(mint);

    // Get associated token accounts
    const fromATA = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
    const toATA = await getAssociatedTokenAddress(mintPubkey, toPubkey);

    // Check if destination token account exists
    const toAccount = await this.connection.getAccountInfo(toATA);

    const instructions: TransactionInstruction[] = [];

    // Create destination token account if it doesn't exist
    if (!toAccount) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          fromPubkey,
          toATA,
          toPubkey,
          mintPubkey
        )
      );
    }

    // Add transfer instruction
    instructions.push(
      createTransferInstruction(
        fromATA,
        toATA,
        fromPubkey,
        BigInt(amount)
      )
    );

    const transaction = new Transaction().add(...instructions);

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.config.wallet]
    );

    return {
      signature,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get recent transaction history
   */
  async getTransactionHistory(address: string, limit = 10): Promise<TransactionResult[]> {
    const signatures = await this.connection.getSignaturesForAddress(
      new PublicKey(address),
      { limit }
    );

    return signatures.map(sig => ({
      signature: sig.signature,
      timestamp: new Date(sig.blockTime! * 1000).toISOString()
    }));
  }
}

export * from './types';
