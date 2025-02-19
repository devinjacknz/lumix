import { EdwinSDK } from 'edwin-sdk';
import { EdwinPluginConfig } from './types';

export class EdwinPlugin {
  private sdk: EdwinSDK;

  constructor(config: EdwinPluginConfig) {
    const sdkConfig = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      evmPrivateKey: config.evmPrivateKey,
      solanaPrivateKey: config.solanaPrivateKey,
      actions: config.actions
    };
    this.sdk = new EdwinSDK(sdkConfig);
  }

  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    // Verify connection and setup
    await this.sdk.initialize();
  }

  /**
   * Get the underlying Edwin SDK instance
   */
  getSDK(): EdwinSDK {
    return this.sdk;
  }

  /**
   * Clean up any resources
   */
  async dispose(): Promise<void> {
    // Cleanup code here
  }
}

export * from './types';
