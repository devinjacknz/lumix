import { ethers } from 'ethers';
import { ChainAdapter, ChainProtocol, Transaction, SimulationResult } from './abstract';

export class EVMAdapter implements ChainAdapter {
  private provider: ethers.providers.JsonRpcProvider;

  constructor(rpcUrl: string) {
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  }

  get protocol(): ChainProtocol {
    return ChainProtocol.EVM;
  }

  async getBalance(address: string): Promise<ethers.BigNumber> {
    return this.provider.getBalance(address);
  }

  async getTransaction(hash: string): Promise<Transaction> {
    const tx = await this.provider.getTransaction(hash);
    if (!tx) throw new Error('Transaction not found');

    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to || '',
      value: tx.value,
      data: tx.data,
      nonce: tx.nonce,
    };
  }

  async sendTransaction(tx: Transaction): Promise<string> {
    const transaction = {
      to: tx.to,
      from: tx.from,
      value: tx.value,
      data: tx.data,
      nonce: tx.nonce,
    };

    const response = await this.provider.sendTransaction(JSON.stringify(transaction));
    return response.hash;
  }

  async simulateTransaction(tx: Transaction): Promise<SimulationResult> {
    try {
      const result = await this.provider.call({
        to: tx.to,
        from: tx.from,
        value: tx.value,
        data: tx.data,
      });

      const gasEstimate = await this.provider.estimateGas({
        to: tx.to,
        from: tx.from,
        value: tx.value,
        data: tx.data,
      });

      return {
        success: true,
        gasUsed: gasEstimate,
        logs: [result],
      };
    } catch (error) {
      return {
        success: false,
        gasUsed: ethers.BigNumber.from(0),
        logs: [],
        error: error.message,
      };
    }
  }
} 