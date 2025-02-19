export interface HeliusConfig {
  apiKey: string;
  webhookUrl?: string;
  network?: 'mainnet-beta' | 'devnet';
  rpcUrl?: string;
}

export interface HeliusClient {
  getBalance(address: string): Promise<number>;
  getTokenBalances(address: string): Promise<any[]>;
  getTransactions(address: string, options?: any): Promise<any[]>;
  getTransaction(signature: string): Promise<any>;
  getTokenMetadata(mint: string): Promise<any>;
  getTokenSupply(mint: string): Promise<any>;
  getTokenAccounts(mint: string): Promise<any[]>;
  getTokenHolders(mint: string): Promise<any[]>;
  getTokenTransfers(mint: string): Promise<any[]>;
  subscribeToWebhook(address: string, webhookUrl: string): Promise<void>;
  unsubscribeFromWebhook(address: string, webhookUrl: string): Promise<void>;
  listWebhookSubscriptions(): Promise<any[]>;
} 