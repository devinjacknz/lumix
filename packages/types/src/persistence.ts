export interface IPersistenceAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;
  store(key: string, value: any): Promise<void>;
  retrieve(key: string): Promise<any>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  getByPattern(pattern: string): Promise<Array<{ key: string; value: any }>>;
  getAll(): Promise<Array<{ key: string; value: any }>>;
  setMany(entries: Array<{ key: string; value: any }>): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
}

export interface PersistenceOptions {
  path?: string;
  maxSize?: number;
  ttl?: number;
} 