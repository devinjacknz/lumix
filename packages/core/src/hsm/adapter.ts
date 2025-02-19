import { BaseError } from '../types/errors';

export class HSMError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HSMError';
  }
}

export interface HSMConfig {
  provider: 'aws' | 'azure' | 'gcp';
  region?: string;
  credentials?: {
    [key: string]: string;
  };
  options?: {
    [key: string]: any;
  };
}

export interface HSMKeyMetadata {
  id: string;
  algorithm: string;
  createdAt: Date;
  expiresAt?: Date;
  status: 'active' | 'inactive' | 'pending' | 'expired';
  tags?: Record<string, string>;
}

export interface HSMOperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: HSMError;
}

export interface HSMAdapter {
  /**
   * 初始化 HSM 连接
   */
  initialize(): Promise<HSMOperationResult>;

  /**
   * 生成新的密钥
   */
  generateKey(
    keySpec: string,
    metadata?: Partial<HSMKeyMetadata>
  ): Promise<HSMOperationResult<HSMKeyMetadata>>;

  /**
   * 使用 HSM 中的密钥加密数据
   */
  encrypt(
    keyId: string,
    data: Buffer,
    context?: Record<string, string>
  ): Promise<HSMOperationResult<Buffer>>;

  /**
   * 使用 HSM 中的密钥解密数据
   */
  decrypt(
    keyId: string,
    encryptedData: Buffer,
    context?: Record<string, string>
  ): Promise<HSMOperationResult<Buffer>>;

  /**
   * 轮换密钥
   */
  rotateKey(
    keyId: string,
    newKeySpec?: string
  ): Promise<HSMOperationResult<HSMKeyMetadata>>;

  /**
   * 获取密钥元数据
   */
  getKeyMetadata(keyId: string): Promise<HSMOperationResult<HSMKeyMetadata>>;

  /**
   * 删除密钥
   */
  deleteKey(keyId: string): Promise<HSMOperationResult>;

  /**
   * 列出所有密钥
   */
  listKeys(
    filter?: Partial<HSMKeyMetadata>
  ): Promise<HSMOperationResult<HSMKeyMetadata[]>>;

  /**
   * 关闭 HSM 连接
   */
  close(): Promise<HSMOperationResult>;
} 