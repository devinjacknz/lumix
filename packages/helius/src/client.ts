import { Connection, PublicKey } from "@solana/web3.js";
import { HeliusConfig, AgentError } from "@lumix/core";
import WebSocket from "ws";

export class HeliusClient {
  private connection: Connection;
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, (data: any) => void>;

  constructor(private config: HeliusConfig) {
    const endpoint = config.endpoint || "https://api.helius-rpc.com";
    this.connection = new Connection(`${endpoint}/${config.apiKey}`);
    this.subscriptions = new Map();
  }

  async getBalance(address: string): Promise<number> {
    try {
      const pubkey = new PublicKey(address);
      const balance = await this.connection.getBalance(pubkey);
      return balance / 10 ** 9; // Convert lamports to SOL
    } catch (error) {
      throw new AgentError(
        `Failed to get balance: ${(error as Error).message}`,
        "BALANCE_ERROR"
      );
    }
  }

  async getTokenAccounts(walletAddress: string) {
    try {
      const response = await fetch(
        `https://api.helius-rpc.com/${this.config.apiKey}/token-accounts?wallet=${walletAddress}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      throw new AgentError(
        `Failed to get token accounts: ${(error as Error).message}`,
        "TOKEN_ACCOUNTS_ERROR"
      );
    }
  }

  async subscribeToAddress(address: string, callback: (data: any) => void): Promise<string> {
    if (!this.config.webhookUrl) {
      throw new AgentError("Webhook URL is required for monitoring", "CONFIG_ERROR");
    }

    try {
      const response = await fetch(
        `https://api.helius-rpc.com/${this.config.apiKey}/webhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            webhookURL: this.config.webhookUrl,
            accountAddresses: [address],
            type: "enhanced",
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const { webhookId } = await response.json();
      this.subscriptions.set(webhookId, callback);
      return webhookId;
    } catch (error) {
      throw new AgentError(
        `Failed to subscribe: ${(error as Error).message}`,
        "SUBSCRIPTION_ERROR"
      );
    }
  }

  async unsubscribe(webhookId: string): Promise<void> {
    try {
      await fetch(
        `https://api.helius-rpc.com/${this.config.apiKey}/webhook/${webhookId}`,
        { method: "DELETE" }
      );
      this.subscriptions.delete(webhookId);
    } catch (error) {
      throw new AgentError(
        `Failed to unsubscribe: ${(error as Error).message}`,
        "UNSUBSCRIBE_ERROR"
      );
    }
  }

  async getDeFiData(protocol: string, params: Record<string, any> = {}) {
    try {
      const queryString = new URLSearchParams(params).toString();
      const response = await fetch(
        `https://api.helius-rpc.com/${this.config.apiKey}/defi/${protocol}?${queryString}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      throw new AgentError(
        `Failed to get DeFi data: ${(error as Error).message}`,
        "DEFI_DATA_ERROR"
      );
    }
  }

  getConnection(): Connection {
    return this.connection;
  }
}
