import { BaseError } from '@lumix/core';
import { Address, keccak256, ecrecover, toBuffer } from '@ethereumjs/util';
import { Transaction } from '@ethereumjs/tx';

export class SignatureError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SignatureError';
  }
}

export interface SignatureConfig {
  chainId: number;
  verificationTimeout?: number; // 毫秒
  maxSignatureAge?: number; // 毫秒
}

export interface SignatureData {
  r: Buffer;
  s: Buffer;
  v: number;
  timestamp: number;
  chainId: number;
}

export interface VerificationResult {
  isValid: boolean;
  signer?: string;
  error?: SignatureError;
  metadata?: {
    timestamp: number;
    chainId: number;
    signatureType: string;
  };
}

export class SignatureVerifier {
  private config: Required<SignatureConfig>;
  private supportedChains: Set<number>;

  constructor(config: SignatureConfig) {
    this.config = {
      chainId: config.chainId,
      verificationTimeout: config.verificationTimeout || 5000, // 5秒
      maxSignatureAge: config.maxSignatureAge || 24 * 60 * 60 * 1000 // 24小时
    };

    // 初始化支持的链
    this.supportedChains = new Set([
      1, // Ethereum Mainnet
      56, // BSC
      137, // Polygon
      42161, // Arbitrum
      10, // Optimism
      this.config.chainId
    ]);
  }

  /**
   * 验证 EVM 兼容链的签名
   */
  async verifyEVMSignature(
    message: Buffer | string,
    signature: string | SignatureData,
    expectedSigner?: string
  ): Promise<VerificationResult> {
    try {
      const messageHash = this.hashMessage(message);
      const sigData = typeof signature === 'string' 
        ? this.parseSignature(signature)
        : signature;

      // 验证签名时间戳
      if (!this.isSignatureTimeValid(sigData.timestamp)) {
        throw new SignatureError('Signature has expired');
      }

      // 恢复签名者地址
      const recoveredAddress = this.recoverSigner(messageHash, sigData);

      // 如果提供了预期签名者，验证是否匹配
      if (expectedSigner && recoveredAddress.toLowerCase() !== expectedSigner.toLowerCase()) {
        throw new SignatureError('Signature does not match expected signer');
      }

      return {
        isValid: true,
        signer: recoveredAddress,
        metadata: {
          timestamp: sigData.timestamp,
          chainId: sigData.chainId,
          signatureType: 'evm'
        }
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof SignatureError ? error : new SignatureError('Signature verification failed')
      };
    }
  }

  /**
   * 验证交易签名
   */
  async verifyTransactionSignature(
    tx: Transaction,
    expectedSigner?: string
  ): Promise<VerificationResult> {
    try {
      const signer = tx.getSenderAddress().toString();

      // 如果提供了预期签名者，验证是否匹配
      if (expectedSigner && signer.toLowerCase() !== expectedSigner.toLowerCase()) {
        throw new SignatureError('Transaction signer does not match expected signer');
      }

      // 验证交易链 ID
      const txChainId = tx.common.chainId();
      if (!this.supportedChains.has(txChainId)) {
        throw new SignatureError(`Unsupported chain ID: ${txChainId}`);
      }

      return {
        isValid: true,
        signer,
        metadata: {
          timestamp: Date.now(), // 交易没有时间戳，使用当前时间
          chainId: txChainId,
          signatureType: 'transaction'
        }
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof SignatureError ? error : new SignatureError('Transaction signature verification failed')
      };
    }
  }

  /**
   * 验证跨链消息签名
   */
  async verifyCrossChainSignature(
    message: Buffer | string,
    sourceChainId: number,
    signature: string | SignatureData,
    expectedSigner?: string
  ): Promise<VerificationResult> {
    // 验证源链是否支持
    if (!this.supportedChains.has(sourceChainId)) {
      return {
        isValid: false,
        error: new SignatureError(`Unsupported source chain ID: ${sourceChainId}`)
      };
    }

    // 构建跨链消息哈希
    const crossChainMessage = Buffer.concat([
      toBuffer(sourceChainId),
      toBuffer(this.config.chainId),
      typeof message === 'string' ? Buffer.from(message) : message
    ]);

    // 验证签名
    return this.verifyEVMSignature(crossChainMessage, signature, expectedSigner);
  }

  /**
   * 生成消息哈希
   */
  private hashMessage(message: Buffer | string): Buffer {
    const messageBuffer = typeof message === 'string' ? Buffer.from(message) : message;
    const prefix = Buffer.from(`\x19Ethereum Signed Message:\n${messageBuffer.length}`);
    return keccak256(Buffer.concat([prefix, messageBuffer]));
  }

  /**
   * 解析签名字符串
   */
  private parseSignature(signature: string): SignatureData {
    if (!signature.startsWith('0x')) {
      throw new SignatureError('Invalid signature format');
    }

    const sigBuffer = toBuffer(signature);
    if (sigBuffer.length !== 65) {
      throw new SignatureError('Invalid signature length');
    }

    return {
      r: sigBuffer.slice(0, 32),
      s: sigBuffer.slice(32, 64),
      v: sigBuffer[64],
      timestamp: Date.now(),
      chainId: this.config.chainId
    };
  }

  /**
   * 恢复签名者地址
   */
  private recoverSigner(messageHash: Buffer, sigData: SignatureData): string {
    const publicKey = ecrecover(
      messageHash,
      sigData.v,
      sigData.r,
      sigData.s
    );

    return Address.fromPublicKey(publicKey).toString();
  }

  /**
   * 验证签名时间是否有效
   */
  private isSignatureTimeValid(timestamp: number): boolean {
    const now = Date.now();
    return timestamp <= now && (now - timestamp) <= this.config.maxSignatureAge;
  }

  /**
   * 添加支持的链
   */
  addSupportedChain(chainId: number): void {
    this.supportedChains.add(chainId);
  }

  /**
   * 移除支持的链
   */
  removeSupportedChain(chainId: number): void {
    if (chainId !== this.config.chainId) {
      this.supportedChains.delete(chainId);
    }
  }

  /**
   * 获取支持的链列表
   */
  getSupportedChains(): number[] {
    return Array.from(this.supportedChains);
  }
} 