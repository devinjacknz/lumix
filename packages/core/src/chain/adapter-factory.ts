import { ChainType } from '../config/types';
import { ChainAdapter } from './types';
import { SolanaAdapter } from './solana-adapter';
import { EthereumAdapter } from './ethereum-adapter';
import { logger } from '../monitoring';

export class ChainAdapterFactory {
  private static instance: ChainAdapterFactory;
  private adapters: Map<ChainType, ChainAdapter>;

  private constructor() {
    this.adapters = new Map();
    this.initializeAdapters();
  }

  public static getInstance(): ChainAdapterFactory {
    if (!ChainAdapterFactory.instance) {
      ChainAdapterFactory.instance = new ChainAdapterFactory();
    }
    return ChainAdapterFactory.instance;
  }

  private initializeAdapters(): void {
    // 初始化Solana适配器
    this.adapters.set('solana', new SolanaAdapter());

    // 初始化Ethereum适配器
    this.adapters.set('ethereum', new EthereumAdapter('ethereum'));

    // 初始化Base适配器（使用Ethereum适配器）
    this.adapters.set('base', new EthereumAdapter('base'));

    logger.info('ChainAdapterFactory', 'Initialized chain adapters', {
      chains: Array.from(this.adapters.keys())
    });
  }

  public getAdapter(chainType: ChainType): ChainAdapter {
    const adapter = this.adapters.get(chainType);
    if (!adapter) {
      throw new Error(`No adapter found for chain type: ${chainType}`);
    }
    return adapter;
  }

  public async deriveAddress(
    chainType: ChainType,
    privateKey: string
  ): Promise<string> {
    try {
      const adapter = this.getAdapter(chainType);
      const { address } = await adapter.deriveAddress(privateKey);
      return address;
    } catch (error) {
      logger.error('ChainAdapterFactory', `Failed to derive address for ${chainType}`, { error });
      throw error;
    }
  }

  public validateAddress(chainType: ChainType, address: string): boolean {
    try {
      const adapter = this.getAdapter(chainType);
      return adapter.validateAddress(address);
    } catch (error) {
      logger.error('ChainAdapterFactory', `Failed to validate address for ${chainType}`, { error });
      return false;
    }
  }

  public validatePrivateKey(chainType: ChainType, privateKey: string): boolean {
    try {
      const adapter = this.getAdapter(chainType);
      return adapter.validatePrivateKey(privateKey);
    } catch (error) {
      logger.error('ChainAdapterFactory', `Failed to validate private key for ${chainType}`, { error });
      return false;
    }
  }

  public formatAddress(chainType: ChainType, address: string): string {
    const adapter = this.getAdapter(chainType);
    return adapter.formatAddress(address);
  }

  public generateKeyPair(chainType: ChainType): { privateKey: string; publicKey: string } {
    try {
      const adapter = this.getAdapter(chainType) as SolanaAdapter | EthereumAdapter;
      return adapter.generateKeyPair();
    } catch (error) {
      logger.error('ChainAdapterFactory', `Failed to generate key pair for ${chainType}`, { error });
      throw error;
    }
  }

  public async recoverFromMnemonic(
    chainType: ChainType,
    mnemonic: string,
    path?: string
  ): Promise<{ privateKey: string; publicKey: string }> {
    try {
      const adapter = this.getAdapter(chainType) as SolanaAdapter | EthereumAdapter;
      return await adapter.recoverFromMnemonic(mnemonic, path);
    } catch (error) {
      logger.error('ChainAdapterFactory', `Failed to recover wallet from mnemonic for ${chainType}`, { error });
      throw error;
    }
  }
} 