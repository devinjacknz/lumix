import * as crypto from 'crypto';
import { EncryptedData } from './types';

export class CryptoService {
  private readonly algorithm: string;
  private readonly keyLength: number;

  constructor(
    private readonly encryptionKey: string,
    algorithm: string = 'aes-256-gcm',
    keyLength: number = 32
  ) {
    this.algorithm = algorithm;
    this.keyLength = keyLength;
  }

  private deriveKey(salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      this.encryptionKey,
      salt,
      100000, // 迭代次数
      this.keyLength,
      'sha256'
    );
  }

  public encrypt(data: string): EncryptedData {
    // 生成随机盐值和初始化向量
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);

    // 从主密钥派生加密密钥
    const key = this.deriveKey(salt);

    // 创建加密器
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    // 加密数据
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // 获取认证标签
    const authTag = cipher.getAuthTag();

    // 组合加密数据
    const combinedData = Buffer.concat([
      salt,
      iv,
      Buffer.from(encrypted, 'hex'),
      authTag
    ]).toString('base64');

    return {
      iv: iv.toString('base64'),
      content: combinedData
    };
  }

  public decrypt(encryptedData: EncryptedData): string {
    // 解析组合数据
    const combined = Buffer.from(encryptedData.content, 'base64');
    
    // 提取各个组件
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const authTag = combined.slice(-16);
    const encrypted = combined.slice(28, -16);

    // 从主密钥派生解密密钥
    const key = this.deriveKey(salt);

    // 创建解密器
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    // 解密数据
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }

  public generateRandomKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  public hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
} 