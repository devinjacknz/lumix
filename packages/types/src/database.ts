export interface DatabaseConfig {
  path: string;
  type: 'sqlite' | 'mysql' | 'postgres';
}

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<T>;
}
