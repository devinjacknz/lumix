declare module 'edwin-sdk' {
  export interface EdwinSDKConfig {
    apiKey: string;
    baseUrl?: string;
    evmPrivateKey?: string;
    solanaPrivateKey?: string;
    actions?: string[];
  }

  export class EdwinSDK {
    constructor(config: EdwinSDKConfig);
    initialize(): Promise<void>;
    // Add other SDK methods as needed
  }
}

export interface EdwinResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface EdwinError {
  code: string;
  message: string;
  details?: unknown;
}

export interface EdwinRequestOptions {
  timeout?: number;
  retries?: number;
}

export interface EdwinPluginConfig {
  apiKey: string;
  baseUrl?: string;
  evmPrivateKey?: string;
  solanaPrivateKey?: string;
  actions?: string[];
} 