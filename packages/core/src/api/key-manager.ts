import { SecureCache } from '../cache/secure';
import { CacheResult } from '../cache/adapter';
import { BaseError } from '../types/errors';

export class APIKeyError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'APIKeyError';
  }
}

interface APIKeyMetadata {
  service: string;
  createdAt: number;
  lastUsed: number;
  usageCount: number;
  rotationDue?: number;
}

interface APIKeyEntry {
  key: string;
  metadata: APIKeyMetadata;
}

interface APIKeyManagerConfig {
  encryptionKey?: string;
  defaultRotationPeriod?: number; // 默认密钥轮换周期（毫秒）
  backupPath?: string; // 密钥备份路径
}

export class APIKeyManager {
  private cache: SecureCache;
  private config: Required<APIKeyManagerConfig>;

  constructor(config: APIKeyManagerConfig = {}) {
    this.config = {
      encryptionKey: config.encryptionKey,
      defaultRotationPeriod: config.defaultRotationPeriod || 30 * 24 * 60 * 60 * 1000, // 30 days
      backupPath: config.backupPath || './api-keys-backup.enc'
    };

    this.cache = new SecureCache({
      encryptionKey: this.config.encryptionKey,
      maxSize: 1000,
      ttl: 365 * 24 * 60 * 60 * 1000 // 1 year
    });
  }

  async addKey(service: string, key: string, rotationPeriod?: number): Promise<CacheResult<void>> {
    const entry: APIKeyEntry = {
      key,
      metadata: {
        service,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
        rotationDue: Date.now() + (rotationPeriod || this.config.defaultRotationPeriod)
      }
    };

    return await this.cache.set(this.getKeyId(service), entry);
  }

  async getKey(service: string): Promise<CacheResult<string>> {
    try {
      const result = await this.cache.get<APIKeyEntry>(this.getKeyId(service));
      
      if (!result.success || !result.data) {
        return {
          success: false,
          error: new APIKeyError(`No API key found for service: ${service}`)
        };
      }

      // 更新使用统计
      const entry = result.data;
      entry.metadata.lastUsed = Date.now();
      entry.metadata.usageCount++;
      await this.cache.set(this.getKeyId(service), entry);

      return { success: true, data: entry.key };
    } catch (error) {
      return {
        success: false,
        error: new APIKeyError(`Failed to get API key for service: ${service}`, { cause: error })
      };
    }
  }

  async rotateKey(service: string, newKey: string): Promise<CacheResult<void>> {
    try {
      const result = await this.cache.get<APIKeyEntry>(this.getKeyId(service));
      
      if (!result.success || !result.data) {
        return {
          success: false,
          error: new APIKeyError(`No API key found for service: ${service}`)
        };
      }

      const oldEntry = result.data;
      const entry: APIKeyEntry = {
        key: newKey,
        metadata: {
          ...oldEntry.metadata,
          createdAt: Date.now(),
          rotationDue: Date.now() + this.config.defaultRotationPeriod
        }
      };

      return await this.cache.set(this.getKeyId(service), entry);
    } catch (error) {
      return {
        success: false,
        error: new APIKeyError(`Failed to rotate API key for service: ${service}`, { cause: error })
      };
    }
  }

  async getRotationDueKeys(): Promise<CacheResult<Array<{ service: string; dueDate: number }>>> {
    try {
      const dueKeys: Array<{ service: string; dueDate: number }> = [];
      const now = Date.now();

      // 遍历所有密钥检查是否需要轮换
      const entries = Array.from(this.cache['cache'].entries());
      for (const [key, entry] of entries) {
        const result = await this.cache.get<APIKeyEntry>(key);
        if (result.success && result.data && result.data.metadata.rotationDue) {
          if (result.data.metadata.rotationDue <= now) {
            dueKeys.push({
              service: result.data.metadata.service,
              dueDate: result.data.metadata.rotationDue
            });
          }
        }
      }

      return { success: true, data: dueKeys };
    } catch (error) {
      return {
        success: false,
        error: new APIKeyError('Failed to get rotation due keys', { cause: error })
      };
    }
  }

  async deleteKey(service: string): Promise<CacheResult<void>> {
    try {
      const exists = await this.cache.has(this.getKeyId(service));
      if (!exists) {
        return {
          success: false,
          error: new APIKeyError(`No API key found for service: ${service}`)
        };
      }

      await this.cache.delete(this.getKeyId(service));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new APIKeyError(`Failed to delete API key for service: ${service}`, { cause: error })
      };
    }
  }

  async getKeyMetadata(service: string): Promise<CacheResult<APIKeyMetadata>> {
    try {
      const result = await this.cache.get<APIKeyEntry>(this.getKeyId(service));
      
      if (!result.success || !result.data) {
        return {
          success: false,
          error: new APIKeyError(`No API key found for service: ${service}`)
        };
      }

      return { success: true, data: result.data.metadata };
    } catch (error) {
      return {
        success: false,
        error: new APIKeyError(`Failed to get API key metadata for service: ${service}`, { cause: error })
      };
    }
  }

  private getKeyId(service: string): string {
    return `api-key:${service}`;
  }
} 