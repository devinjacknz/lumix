import { IPersistenceAdapter } from '@lumix/types';

export interface PersistenceOptions {
  adapter: IPersistenceAdapter;
  namespace?: string;
  path?: string;
  maxSize?: number;
  ttl?: number;
}

/**
 * 基础持久化管理器实现
 */
export class BasePersistenceManager {
  private adapter: IPersistenceAdapter;
  protected namespace: string;

  constructor(options: PersistenceOptions) {
    this.adapter = options.adapter;
    this.namespace = options.namespace || '';
  }

  /**
   * 获取带命名空间的键名
   */
  protected getNamespacedKey(key: string): string {
    return this.namespace ? `${this.namespace}:${key}` : key;
  }

  /**
   * 移除键名中的命名空间
   */
  protected removeNamespace(key: string): string {
    return this.namespace ? key.replace(`${this.namespace}:`, '') : key;
  }

  async initialize(): Promise<void> {
    await this.adapter.initialize();
  }

  async store(key: string, value: any): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    await this.adapter.store(namespacedKey, value);
  }

  async retrieve(key: string): Promise<any> {
    const namespacedKey = this.getNamespacedKey(key);
    return await this.adapter.retrieve(namespacedKey);
  }

  async delete(key: string): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    await this.adapter.delete(namespacedKey);
  }

  async clear(): Promise<void> {
    await this.adapter.clear();
  }

  async getByPattern<T>(pattern: string): Promise<Map<string, T>> {
    const namespacedPattern = this.getNamespacedKey(pattern);
    const entries = await this.adapter.getByPattern(namespacedPattern);
    
    const result = new Map<string, T>();
    for (const entry of entries) {
      result.set(this.removeNamespace(entry.key), entry.value as T);
    }
    return result;
  }

  async getAll<T>(): Promise<Map<string, T>> {
    if (this.namespace) {
      return this.getByPattern<T>('*');
    }
    
    const entries = await this.adapter.getAll();
    const result = new Map<string, T>();
    for (const entry of entries) {
      result.set(entry.key, entry.value as T);
    }
    return result;
  }

  async setMany<T>(entries: Map<string, T>): Promise<void> {
    const namespacedEntries = Array.from(entries.entries()).map(([key, value]) => ({
      key: this.getNamespacedKey(key),
      value
    }));
    await this.adapter.setMany(namespacedEntries);
  }

  async deleteMany(keys: string[]): Promise<void> {
    const namespacedKeys = keys.map(key => this.getNamespacedKey(key));
    await this.adapter.deleteMany(namespacedKeys);
  }
}

/**
 * 创建持久化管理器
 */
export function createPersistenceManager(options: PersistenceOptions): BasePersistenceManager {
  return new BasePersistenceManager(options);
}
