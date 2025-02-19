import { createCipheriv, createDecipheriv, randomBytes, CipherGCM, DecipherGCM } from 'crypto';

export interface EncryptionResult {
  encrypted: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export class CryptoManager {
  private algorithm: string;
  private keyLength: number;

  constructor(algorithm = 'aes-256-gcm', keyLength = 32) {
    this.algorithm = algorithm;
    this.keyLength = keyLength;
  }

  generateKey(): Buffer {
    return randomBytes(this.keyLength);
  }

  generateIV(): Buffer {
    return randomBytes(12); // For GCM mode, 12 bytes is recommended
  }

  encrypt(data: Buffer, key: Buffer): EncryptionResult {
    const iv = this.generateIV();
    const cipher = createCipheriv(this.algorithm, key, iv) as CipherGCM;
    
    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv,
      authTag
    };
  }

  decrypt(encrypted: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): Buffer {
    const decipher = createDecipheriv(this.algorithm, key, iv) as DecipherGCM;
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
  }

  encryptString(data: string, key: Buffer): string {
    const result = this.encrypt(Buffer.from(data), key);
    return JSON.stringify({
      encrypted: result.encrypted.toString('base64'),
      iv: result.iv.toString('base64'),
      authTag: result.authTag.toString('base64')
    });
  }

  decryptString(encryptedJson: string, key: Buffer): string {
    const { encrypted, iv, authTag } = JSON.parse(encryptedJson);
    const decrypted = this.decrypt(
      Buffer.from(encrypted, 'base64'),
      key,
      Buffer.from(iv, 'base64'),
      Buffer.from(authTag, 'base64')
    );
    return decrypted.toString();
  }
} 