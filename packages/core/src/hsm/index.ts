import { HSMAdapter, HSMConfig, HSMError } from './adapter';
import { AWSCloudHSMAdapter } from './aws';

export * from './adapter';
export * from './aws';

export class HSMFactory {
  private static instance: HSMFactory;
  private adapters: Map<string, HSMAdapter>;

  private constructor() {
    this.adapters = new Map();
  }

  static getInstance(): HSMFactory {
    if (!HSMFactory.instance) {
      HSMFactory.instance = new HSMFactory();
    }
    return HSMFactory.instance;
  }

  /**
   * 创建或获取 HSM 适配器实例
   */
  getAdapter(config: HSMConfig): HSMAdapter {
    const key = this.getAdapterKey(config);
    let adapter = this.adapters.get(key);

    if (!adapter) {
      adapter = this.createAdapter(config);
      this.adapters.set(key, adapter);
    }

    return adapter;
  }

  /**
   * 移除 HSM 适配器实例
   */
  async removeAdapter(config: HSMConfig): Promise<void> {
    const key = this.getAdapterKey(config);
    const adapter = this.adapters.get(key);

    if (adapter) {
      await adapter.close();
      this.adapters.delete(key);
    }
  }

  /**
   * 关闭所有 HSM 连接
   */
  async closeAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.close();
    }
    this.adapters.clear();
  }

  private createAdapter(config: HSMConfig): HSMAdapter {
    switch (config.provider) {
      case 'aws':
        return new AWSCloudHSMAdapter(config);
      case 'azure':
        // TODO: 实现 Azure Key Vault 适配器
        throw new HSMError('Azure Key Vault adapter not implemented');
      case 'gcp':
        // TODO: 实现 Google Cloud KMS 适配器
        throw new HSMError('Google Cloud KMS adapter not implemented');
      default:
        throw new HSMError(`Unsupported HSM provider: ${config.provider}`);
    }
  }

  private getAdapterKey(config: HSMConfig): string {
    return `${config.provider}:${config.region || 'default'}`;
  }
} 