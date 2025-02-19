import { CryptoManager, EncryptionResult } from './crypto';
import { DatabaseManager } from '../database/database-manager';
import { Logger } from '../monitoring/logger';

export interface KeyManagerConfig {
  rotationInterval: number;
  keyLength: number;
  algorithm: string;
  masterKeyId: string;
}

export interface KeyRecord {
  id: string;
  version: number;
  key: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'expired' | 'revoked';
}

export class KeyManager {
  private config: Required<KeyManagerConfig>;
  private cryptoManager: CryptoManager;
  private databaseManager: DatabaseManager;
  private logger: Logger;
  private rotationInterval?: NodeJS.Timeout;

  constructor(
    config: KeyManagerConfig,
    databaseManager: DatabaseManager,
    logger: Logger
  ) {
    this.config = {
      rotationInterval: config.rotationInterval || 24 * 60 * 60 * 1000, // 24 hours
      keyLength: config.keyLength || 32,
      algorithm: config.algorithm || 'aes-256-gcm',
      masterKeyId: config.masterKeyId
    };
    this.cryptoManager = new CryptoManager(this.config.algorithm, this.config.keyLength);
    this.databaseManager = databaseManager;
    this.logger = logger;
  }

  async start(): Promise<void> {
    await this.initializeKeys();
    this.rotationInterval = setInterval(
      () => this.rotateKeys(),
      this.config.rotationInterval
    );
  }

  async stop(): Promise<void> {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = undefined;
    }
  }

  private async initializeKeys(): Promise<void> {
    const activeKeys = await this.getActiveKeys();
    if (activeKeys.length === 0) {
      await this.generateNewKey();
    }
  }

  private async rotateKeys(): Promise<void> {
    try {
      const activeKeys = await this.getActiveKeys();
      const oldestKey = activeKeys[0];

      if (oldestKey && oldestKey.expiresAt <= new Date()) {
        await this.expireKey(oldestKey.id);
        await this.generateNewKey();
      }
    } catch (error) {
      this.logger.error(
        'KeyManager',
        `Key rotation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error }
      );
    }
  }

  private async generateNewKey(): Promise<KeyRecord> {
    const key = this.cryptoManager.generateKey();
    const encryptedKey = await this.encryptKey(key);
    
    const keyRecord: KeyRecord = {
      id: crypto.randomUUID(),
      version: 1,
      key: encryptedKey,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.rotationInterval),
      status: 'active'
    };

    await this.databaseManager.saveKey(keyRecord);
    return keyRecord;
  }

  private async encryptKey(key: Buffer): Promise<string> {
    const masterKey = await this.getMasterKey();
    return this.cryptoManager.encryptString(key.toString('base64'), masterKey);
  }

  private async decryptKey(encryptedKey: string): Promise<Buffer> {
    const masterKey = await this.getMasterKey();
    const decrypted = this.cryptoManager.decryptString(encryptedKey, masterKey);
    return Buffer.from(decrypted, 'base64');
  }

  private async getMasterKey(): Promise<Buffer> {
    // In a real implementation, this would retrieve the master key from a secure storage
    // For now, we'll use a placeholder
    return Buffer.from(this.config.masterKeyId.repeat(2));
  }

  private async getActiveKeys(): Promise<KeyRecord[]> {
    return this.databaseManager.getActiveKeys();
  }

  private async expireKey(keyId: string): Promise<void> {
    await this.databaseManager.updateKeyStatus(keyId, 'expired');
  }

  async encrypt(data: Buffer): Promise<EncryptionResult & { keyId: string }> {
    const activeKeys = await this.getActiveKeys();
    if (activeKeys.length === 0) {
      throw new Error('No active keys available');
    }

    const latestKey = activeKeys[activeKeys.length - 1];
    const key = await this.decryptKey(latestKey.key);
    const result = this.cryptoManager.encrypt(data, key);

    return {
      ...result,
      keyId: latestKey.id
    };
  }

  async decrypt(
    encrypted: Buffer,
    keyId: string,
    iv: Buffer,
    authTag: Buffer
  ): Promise<Buffer> {
    const keyRecord = await this.databaseManager.getKey(keyId);
    if (!keyRecord) {
      throw new Error('Key not found');
    }

    const key = await this.decryptKey(keyRecord.key);
    return this.cryptoManager.decrypt(encrypted, key, iv, authTag);
  }
} 