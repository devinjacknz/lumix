import { ChainType } from '../config/types';

export interface EncryptedData {
  iv: string;
  content: string;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface WalletInfo {
  chain: ChainType;
  address: string;
  encryptedPrivateKey: EncryptedData;
  lastUsed: Date;
}

export interface VaultConfig {
  encryptionKey: string;
  algorithm?: string;
  keyLength?: number;
}

export interface AuditLogEntry {
  timestamp: Date;
  action: 'encrypt' | 'decrypt' | 'access' | 'update';
  chain: ChainType;
  address: string;
  success: boolean;
  error?: string;
} 