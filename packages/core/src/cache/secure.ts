import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { MemoryCache } from './memory';
import { CacheConfig, CacheResult } from './adapter';
import { CacheError } from './index';

interface SecureCacheConfig extends CacheConfig {
  encryptionKey?: string;
  algorithm?: string;
}

export class SecureCache extends MemoryCache {
  private encryptionKey: Buffer;
  private algorithm: string;
  private salt: Buffer;

  constructor(config: SecureCacheConfig = {}) {
    super(config);
    this.salt = randomBytes(16);
    this.algorithm = config.algorithm || 'aes-256-gcm';
    
    // 如果没有提供加密密钥，生成一个随机的
    if (!config.encryptionKey) {
      const tempKey = randomBytes(32).toString('hex');
      console.warn('No encryption key provided, using temporary key:', tempKey);
      this.encryptionKey = this.deriveKey(tempKey);
    } else {
      this.encryptionKey = this.deriveKey(config.encryptionKey);
    }
  }

  private deriveKey(password: string): Buffer {
    return scryptSync(password, this.salt, 32);
  }

  private encrypt(data: any): { encrypted: string; iv: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted: encrypted + ':' + authTag.toString('hex'),
      iv: iv.toString('hex')
    };
  }

  private decrypt(encrypted: string, iv: string): any {
    const [data, authTag] = encrypted.split(':');
    const decipher = createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<CacheResult<void>> {
    try {
      const { encrypted, iv } = this.encrypt(value);
      return await super.set(key, { encrypted, iv }, ttl);
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to set encrypted cache entry', { cause: error })
      };
    }
  }

  async get<T>(key: string): Promise<CacheResult<T | null>> {
    try {
      const result = await super.get<{ encrypted: string; iv: string }>(key);
      
      if (!result.success || !result.data) {
        return result as CacheResult<T | null>;
      }
      
      const decrypted = this.decrypt(result.data.encrypted, result.data.iv);
      return { success: true, data: decrypted };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to get encrypted cache entry', { cause: error })
      };
    }
  }

  // 导出加密密钥（用于备份/恢复）
  exportKey(): string {
    return this.encryptionKey.toString('hex');
  }

  // 更新加密密钥（用于密钥轮换）
  async updateEncryptionKey(newKey: string): Promise<CacheResult<void>> {
    try {
      const oldKey = this.encryptionKey;
      const newDerivedKey = this.deriveKey(newKey);
      
      // 获取所有缓存条目
      const entries = Array.from(this.cache.entries());
      
      // 临时保存旧密钥
      this.encryptionKey = oldKey;
      
      // 使用新密钥重新加密所有条目
      for (const [key, entry] of entries) {
        const result = await this.get(key);
        if (result.success && result.data) {
          this.encryptionKey = newDerivedKey;
          await this.set(key, result.data, entry.expiresAt ? entry.expiresAt - Date.now() : undefined);
        }
      }
      
      this.encryptionKey = newDerivedKey;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new CacheError('Failed to update encryption key', { cause: error })
      };
    }
  }
} 