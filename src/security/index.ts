export * from './crypto';
export * from './key-manager';

import { CryptoManager } from './crypto';
import { KeyManager } from './key-manager';
import { DatabaseManager } from '../database/database-manager';
import { Logger } from '../monitoring/logger';

export interface SecurityConfig {
  keyManager: {
    rotationInterval: number;
    keyLength: number;
    algorithm: string;
    masterKeyId: string;
  };
}

export class SecurityManager {
  private cryptoManager: CryptoManager;
  private keyManager: KeyManager;

  constructor(
    config: SecurityConfig,
    databaseManager: DatabaseManager,
    logger: Logger
  ) {
    this.cryptoManager = new CryptoManager(
      config.keyManager.algorithm,
      config.keyManager.keyLength
    );
    this.keyManager = new KeyManager(
      config.keyManager,
      databaseManager,
      logger
    );
  }

  async start(): Promise<void> {
    await this.keyManager.start();
  }

  async stop(): Promise<void> {
    await this.keyManager.stop();
  }

  getCryptoManager(): CryptoManager {
    return this.cryptoManager;
  }

  getKeyManager(): KeyManager {
    return this.keyManager;
  }
} 