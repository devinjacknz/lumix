import { Wallet } from 'ethers';
import { ChainAdapter, ChainAddress, AddressDerivationOptions } from './types';
import { ChainType } from '../config/types';
import { logger } from '../monitoring';

export class EthereumAdapter implements ChainAdapter {
  private readonly chainType: ChainType;
  private wallet: Wallet | null = null;

  constructor(chainType: ChainType = 'ethereum') {
    if (chainType !== 'ethereum' && chainType !== 'base') {
      throw new Error('Invalid chain type for EthereumAdapter');
    }
    this.chainType = chainType;
  }

  public async connect(): Promise<void> {
    // 在这里可以添加连接到以太坊网络的逻辑
    logger.info('EthereumAdapter', `Connected to ${this.chainType} network`);
  }

  public async disconnect(): Promise<void> {
    this.wallet = null;
    logger.info('EthereumAdapter', `Disconnected from ${this.chainType} network`);
  }

  public async getAddress(options?: AddressDerivationOptions): Promise<ChainAddress> {
    try {
      if (!this.wallet) {
        this.wallet = Wallet.createRandom();
      }

      // 如果提供了 path，可以使用它来派生新的地址
      if (options?.path) {
        const derivedWallet = Wallet.fromMnemonic(this.wallet.mnemonic.phrase, options.path);
        return {
          address: await derivedWallet.getAddress(),
          publicKey: derivedWallet.publicKey,
          privateKey: derivedWallet.privateKey
        };
      }

      return {
        address: await this.wallet.getAddress(),
        publicKey: this.wallet.publicKey,
        privateKey: this.wallet.privateKey
      };
    } catch (error) {
      logger.error('EthereumAdapter', `Failed to get ${this.chainType} address`, { error });
      throw new Error(`Failed to get ${this.chainType} address: ${error.message}`);
    }
  }

  public getChainType(): ChainType {
    return this.chainType;
  }

  public validateAddress(address: string): boolean {
    try {
      return isAddress(address);
    } catch {
      return false;
    }
  }

  public validatePrivateKey(privateKey: string): boolean {
    try {
      // 确保私钥是有效的十六进制
      if (!privateKey.startsWith('0x')) {
        privateKey = `0x${privateKey}`;
      }
      
      // 验证私钥长度（32字节 = 64个十六进制字符）
      if (privateKey.length !== 66) { // 包括 '0x' 前缀
        return false;
      }

      // 尝试创建钱包实例
      new Wallet(privateKey);
      return true;
    } catch {
      return false;
    }
  }

  public formatAddress(address: string): string {
    try {
      return getAddress(address).toLowerCase();
    } catch {
      throw new Error(`Invalid ${this.chainType} address`);
    }
  }

  // 辅助方法：生成新的密钥对
  public generateKeyPair(): { privateKey: string; publicKey: string } {
    const wallet = Wallet.createRandom();
    return {
      privateKey: wallet.privateKey,
      publicKey: wallet.publicKey
    };
  }

  // 辅助方法：从助记词恢复密钥对
  public async recoverFromMnemonic(
    mnemonic: string,
    path: string = "m/44'/60'/0'/0/0"
  ): Promise<{ privateKey: string; publicKey: string }> {
    try {
      const wallet = Wallet.fromMnemonic(mnemonic, path);
      return {
        privateKey: wallet.privateKey,
        publicKey: wallet.publicKey
      };
    } catch (error) {
      logger.error('EthereumAdapter', `Failed to recover wallet from mnemonic`, { error });
      throw new Error(`Failed to recover wallet: ${error.message}`);
    }
  }

  // 辅助方法：检查校验和地址
  public toChecksumAddress(address: string): string {
    try {
      return getAddress(address);
    } catch {
      throw new Error(`Invalid ${this.chainType} address`);
    }
  }
} 