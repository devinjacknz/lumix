import {
  KMSClient,
  GenerateDataKeyCommand,
  EncryptCommand,
  DecryptCommand,
  ScheduleKeyDeletionCommand,
  DescribeKeyCommand,
  ListKeysCommand,
  CreateKeyCommand,
  TagResourceCommand,
  ListResourceTagsCommand
} from '@aws-sdk/client-kms';
import { HSMAdapter, HSMConfig, HSMError, HSMKeyMetadata, HSMOperationResult } from './adapter';

export class AWSCloudHSMAdapter implements HSMAdapter {
  private client: KMSClient;
  private config: Required<HSMConfig>;
  private initialized: boolean = false;

  constructor(config: HSMConfig) {
    this.config = {
      provider: config.provider,
      region: config.region || 'us-east-1',
      credentials: config.credentials || {},
      options: config.options || {}
    };
  }

  async initialize(): Promise<HSMOperationResult> {
    try {
      this.client = new KMSClient({
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.credentials['accessKeyId'],
          secretAccessKey: this.config.credentials['secretAccessKey']
        },
        ...this.config.options
      });

      this.initialized = true;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new HSMError('Failed to initialize AWS CloudHSM', { cause: error })
      };
    }
  }

  async generateKey(
    keySpec: string,
    metadata?: Partial<HSMKeyMetadata>
  ): Promise<HSMOperationResult<HSMKeyMetadata>> {
    try {
      if (!this.initialized) {
        throw new HSMError('HSM not initialized');
      }

      const command = new CreateKeyCommand({
        KeyUsage: 'ENCRYPT_DECRYPT',
        CustomerMasterKeySpec: keySpec,
        Description: metadata?.tags?.description,
        Tags: Object.entries(metadata?.tags || {}).map(([Key, Value]) => ({
          Key,
          Value
        }))
      });

      const response = await this.client.send(command);

      if (!response.KeyMetadata) {
        throw new HSMError('Failed to get key metadata');
      }

      const keyMetadata: HSMKeyMetadata = {
        id: response.KeyMetadata.KeyId,
        algorithm: response.KeyMetadata.CustomerMasterKeySpec || keySpec,
        createdAt: response.KeyMetadata.CreationDate || new Date(),
        status: this.mapKeyState(response.KeyMetadata.KeyState),
        tags: metadata?.tags
      };

      return { success: true, data: keyMetadata };
    } catch (error) {
      return {
        success: false,
        error: new HSMError('Failed to generate key', { cause: error })
      };
    }
  }

  async encrypt(
    keyId: string,
    data: Buffer,
    context?: Record<string, string>
  ): Promise<HSMOperationResult<Buffer>> {
    try {
      if (!this.initialized) {
        throw new HSMError('HSM not initialized');
      }

      const command = new EncryptCommand({
        KeyId: keyId,
        Plaintext: data,
        EncryptionContext: context
      });

      const response = await this.client.send(command);

      if (!response.CiphertextBlob) {
        throw new HSMError('No ciphertext returned');
      }

      return { success: true, data: Buffer.from(response.CiphertextBlob) };
    } catch (error) {
      return {
        success: false,
        error: new HSMError('Failed to encrypt data', { cause: error })
      };
    }
  }

  async decrypt(
    keyId: string,
    encryptedData: Buffer,
    context?: Record<string, string>
  ): Promise<HSMOperationResult<Buffer>> {
    try {
      if (!this.initialized) {
        throw new HSMError('HSM not initialized');
      }

      const command = new DecryptCommand({
        KeyId: keyId,
        CiphertextBlob: encryptedData,
        EncryptionContext: context
      });

      const response = await this.client.send(command);

      if (!response.Plaintext) {
        throw new HSMError('No plaintext returned');
      }

      return { success: true, data: Buffer.from(response.Plaintext) };
    } catch (error) {
      return {
        success: false,
        error: new HSMError('Failed to decrypt data', { cause: error })
      };
    }
  }

  async rotateKey(
    keyId: string,
    newKeySpec?: string
  ): Promise<HSMOperationResult<HSMKeyMetadata>> {
    try {
      if (!this.initialized) {
        throw new HSMError('HSM not initialized');
      }

      // AWS KMS automatically handles key rotation
      // We just need to get the updated metadata
      const metadata = await this.getKeyMetadata(keyId);
      return metadata;
    } catch (error) {
      return {
        success: false,
        error: new HSMError('Failed to rotate key', { cause: error })
      };
    }
  }

  async getKeyMetadata(keyId: string): Promise<HSMOperationResult<HSMKeyMetadata>> {
    try {
      if (!this.initialized) {
        throw new HSMError('HSM not initialized');
      }

      const command = new DescribeKeyCommand({
        KeyId: keyId
      });

      const response = await this.client.send(command);

      if (!response.KeyMetadata) {
        throw new HSMError('No key metadata returned');
      }

      // Get tags
      const tagsCommand = new ListResourceTagsCommand({
        KeyId: keyId
      });

      const tagsResponse = await this.client.send(tagsCommand);
      const tags: Record<string, string> = {};
      
      tagsResponse.Tags?.forEach(tag => {
        if (tag.Key && tag.Value) {
          tags[tag.Key] = tag.Value;
        }
      });

      const metadata: HSMKeyMetadata = {
        id: response.KeyMetadata.KeyId,
        algorithm: response.KeyMetadata.CustomerMasterKeySpec || 'SYMMETRIC_DEFAULT',
        createdAt: response.KeyMetadata.CreationDate || new Date(),
        status: this.mapKeyState(response.KeyMetadata.KeyState),
        tags
      };

      return { success: true, data: metadata };
    } catch (error) {
      return {
        success: false,
        error: new HSMError('Failed to get key metadata', { cause: error })
      };
    }
  }

  async deleteKey(keyId: string): Promise<HSMOperationResult> {
    try {
      if (!this.initialized) {
        throw new HSMError('HSM not initialized');
      }

      const command = new ScheduleKeyDeletionCommand({
        KeyId: keyId,
        PendingWindowInDays: 7 // 7 days waiting period before deletion
      });

      await this.client.send(command);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new HSMError('Failed to delete key', { cause: error })
      };
    }
  }

  async listKeys(
    filter?: Partial<HSMKeyMetadata>
  ): Promise<HSMOperationResult<HSMKeyMetadata[]>> {
    try {
      if (!this.initialized) {
        throw new HSMError('HSM not initialized');
      }

      const command = new ListKeysCommand({});
      const response = await this.client.send(command);

      if (!response.Keys) {
        return { success: true, data: [] };
      }

      const keys: HSMKeyMetadata[] = [];
      for (const key of response.Keys) {
        if (key.KeyId) {
          const metadata = await this.getKeyMetadata(key.KeyId);
          if (metadata.success && metadata.data) {
            // Apply filters if any
            if (this.matchesFilter(metadata.data, filter)) {
              keys.push(metadata.data);
            }
          }
        }
      }

      return { success: true, data: keys };
    } catch (error) {
      return {
        success: false,
        error: new HSMError('Failed to list keys', { cause: error })
      };
    }
  }

  async close(): Promise<HSMOperationResult> {
    try {
      this.initialized = false;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: new HSMError('Failed to close HSM connection', { cause: error })
      };
    }
  }

  private mapKeyState(state?: string): HSMKeyMetadata['status'] {
    switch (state) {
      case 'Enabled':
        return 'active';
      case 'Disabled':
        return 'inactive';
      case 'PendingDeletion':
        return 'pending';
      default:
        return 'inactive';
    }
  }

  private matchesFilter(
    metadata: HSMKeyMetadata,
    filter?: Partial<HSMKeyMetadata>
  ): boolean {
    if (!filter) return true;

    return Object.entries(filter).every(([key, value]) => {
      if (key === 'tags' && value && metadata.tags) {
        return Object.entries(value).every(
          ([tagKey, tagValue]) => metadata.tags?.[tagKey] === tagValue
        );
      }
      return metadata[key as keyof HSMKeyMetadata] === value;
    });
  }
} 