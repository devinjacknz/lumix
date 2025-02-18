import { PublicKey, Keypair } from '@solana/web3.js';
import { ChainAdapter, ChainAddress, AddressDerivationOptions } from './types';
import { ChainType } from '../config/types';
import { logger } from '../monitoring';
import * as bs58 from 'bs58';

export class SolanaAdapter implements ChainAdapter {
  public getChainType(): ChainType {
    return 'solana';
  }

  public async deriveAddress(
    privateKey: string,
    options?: AddressDerivationOptions
  ): Promise<ChainAddress> {
    try {
      let keypair: Keypair;

      // 处理不同格式的私钥
      if (privateKey.length === 88 && privateKey.startsWith('[')) {
        // JSON格式的私钥数组
        const privateKeyArray = JSON.parse(privateKey);
        keypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
      } else if (privateKey.length === 64 || privateKey.length === 128) {
        // Hex格式的私钥
        const privateKeyBuffer = Buffer.from(privateKey, 'hex');
        keypair = Keypair.fromSecretKey(privateKeyBuffer);
      } else {
        // Base58格式的私钥
        const privateKeyBuffer = bs58.decode(privateKey);
        keypair = Keypair.fromSecretKey(privateKeyBuffer);
      }

      const publicKey = keypair.publicKey;
      const address = publicKey.toBase58();

      logger.debug('SolanaAdapter', 'Derived Solana address', {
        address,
        network: options?.network || 'mainnet'
      });

      return {
        address,
        publicKey: publicKey.toBase58(),
        chain: this.getChainType()
      };
    } catch (error) {
      logger.error('SolanaAdapter', 'Failed to derive Solana address', { error });
      throw new Error(`Failed to derive Solana address: ${error.message}`);
    }
  }

  public validateAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  public validatePrivateKey(privateKey: string): boolean {
    try {
      // 尝试从私钥创建Keypair
      if (privateKey.length === 88 && privateKey.startsWith('[')) {
        const privateKeyArray = JSON.parse(privateKey);
        Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
      } else if (privateKey.length === 64 || privateKey.length === 128) {
        const privateKeyBuffer = Buffer.from(privateKey, 'hex');
        Keypair.fromSecretKey(privateKeyBuffer);
      } else {
        const privateKeyBuffer = bs58.decode(privateKey);
        Keypair.fromSecretKey(privateKeyBuffer);
      }
      return true;
    } catch {
      return false;
    }
  }

  public formatAddress(address: string): string {
    try {
      return new PublicKey(address).toBase58();
    } catch {
      throw new Error('Invalid Solana address');
    }
  }

  // 辅助方法：生成新的密钥对
  public generateKeyPair(): { privateKey: string; publicKey: string } {
    const keypair = Keypair.generate();
    return {
      privateKey: bs58.encode(keypair.secretKey),
      publicKey: keypair.publicKey.toBase58()
    };
  }

  // 辅助方法：从助记词恢复密钥对（如果需要）
  public async recoverFromMnemonic(
    mnemonic: string,
    path: string = "m/44'/501'/0'/0'"
  ): Promise<{ privateKey: string; publicKey: string }> {
    throw new Error('Method not implemented');
    // TODO: 实现从助记词恢复密钥对的功能
  }
} 