import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BaseChainAdapter } from './base';
import { BlockData, TransactionData, AccountData, TransactionConfig, ChainState, ChainCoreError } from '../types';

export class SolanaChainAdapter extends BaseChainAdapter {
  private connection: Connection;
  
  async connect(): Promise<void> {
    try {
      this.connection = new Connection(this.config.rpcUrl);
      await this.connection.getVersion();
      this.connected = true;
    } catch (error) {
      throw new ChainCoreError('Failed to connect to Solana chain', error as Error);
    }
  }

  async disconnect(): Promise<void> {
    this.connection = null;
    this.connected = false;
  }

  async getBlock(blockNumber: number): Promise<BlockData> {
    this.ensureConnected();
    
    try {
      const block = await this.connection.getBlock(blockNumber);
      if (!block) {
        throw new Error('Block not found');
      }

      return {
        number: blockNumber,
        hash: block.blockhash,
        timestamp: block.blockTime * 1000, // Convert to milliseconds
        transactions: block.transactions.map(tx => tx.transaction.signatures[0])
      };
    } catch (error) {
      throw new ChainCoreError(`Failed to get block ${blockNumber}`, error as Error);
    }
  }

  async getTransaction(txHash: string): Promise<TransactionData> {
    this.ensureConnected();
    
    try {
      const tx = await this.connection.getTransaction(txHash);
      if (!tx) {
        throw new Error('Transaction not found');
      }

      const { meta } = tx;
      if (!meta) {
        throw new Error('Transaction metadata not found');
      }

      return {
        hash: txHash,
        from: tx.transaction.message.accountKeys[0].toString(),
        to: tx.transaction.message.accountKeys[1].toString(),
        value: (meta.postBalances[1] - meta.preBalances[1]).toString(),
        blockNumber: tx.slot,
        timestamp: tx.blockTime * 1000, // Convert to milliseconds
        status: meta.err === null,
        gasUsed: meta.fee,
        effectiveGasPrice: '0' // Solana has fixed transaction costs
      };
    } catch (error) {
      throw new ChainCoreError(`Failed to get transaction ${txHash}`, error as Error);
    }
  }

  async getAccount(address: string): Promise<AccountData> {
    this.ensureConnected();
    
    try {
      const pubkey = new PublicKey(address);
      const [accountInfo, balance] = await Promise.all([
        this.connection.getAccountInfo(pubkey),
        this.connection.getBalance(pubkey)
      ]);

      return {
        address,
        balance: balance.toString(),
        nonce: 0, // Solana doesn't have account nonces
        code: accountInfo?.data ? Buffer.from(accountInfo.data).toString('hex') : undefined
      };
    } catch (error) {
      throw new ChainCoreError(`Failed to get account ${address}`, error as Error);
    }
  }

  async getGasPrice(): Promise<string> {
    // Solana has fixed transaction costs
    return '0';
  }

  async sendTransaction(tx: TransactionConfig): Promise<string> {
    this.ensureConnected();
    this.validateTransaction(tx);
    
    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(tx.from),
          toPubkey: new PublicKey(tx.to),
          lamports: tx.value ? Number(tx.value) * LAMPORTS_PER_SOL : 0
        })
      );

      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Note: This is a simplified implementation
      // In real applications, you need to sign the transaction with the sender's private key
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize()
      );

      return signature;
    } catch (error) {
      throw new ChainCoreError('Failed to send transaction', error as Error);
    }
  }

  async estimateGas(tx: TransactionConfig): Promise<number> {
    // Solana has fixed transaction costs
    return 5000;
  }

  async getChainState(): Promise<ChainState> {
    this.ensureConnected();
    
    try {
      const [slot, block, supply, performance] = await Promise.all([
        this.connection.getSlot(),
        this.connection.getBlock(await this.connection.getSlot()),
        this.connection.getSupply(),
        this.connection.getRecentPerformanceSamples(1)
      ]);

      if (!block) {
        throw new Error('Failed to get latest block');
      }

      const tps = performance[0]?.numTransactions / performance[0]?.samplePeriodSecs || 0;

      return {
        latestBlock: {
          number: slot,
          hash: block.blockhash,
          timestamp: block.blockTime * 1000,
          transactions: block.transactions.map(tx => tx.transaction.signatures[0])
        },
        metrics: {
          blockTime: performance[0]?.samplePeriodSecs * 1000 / performance[0]?.numSlots || 0,
          gasPrice: '0',
          tps,
          pendingTxCount: 0 // Solana doesn't expose pending transaction count
        },
        timestamp: Date.now()
      };
    } catch (error) {
      throw new ChainCoreError('Failed to get chain state', error as Error);
    }
  }
} 