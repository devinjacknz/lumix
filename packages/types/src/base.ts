// Base types
export interface BaseConfig {
  name: string;
  version: string;
  description?: string;
}

export interface BaseResult {
  success: boolean;
  error?: string | Error;
  data?: any;
}

export interface BaseManager {
  initialize(): Promise<void>;
  destroy(): Promise<void>;
}
