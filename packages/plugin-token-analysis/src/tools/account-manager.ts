import { Tool } from "langchain/tools";
import { logger } from "@lumix/core";
import { ChainProtocol } from "@lumix/core";
import { ethers } from "ethers";

export interface AccountManagerConfig {
  rpcUrl: string;
  protocol: ChainProtocol;
  maxConcurrent: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  keystorePath?: string;
  defaultGasLimit: string;
  defaultGasPrice: string;
}

export interface AccountInfo {
  address: string;
  balance: string;
  nonce: number;
  type: "eoa" | "contract";
  code?: string;
  tokens?: Array<{
    address: string;
    symbol: string;
    balance: string;
  }>;
}

export interface AccountActivity {
  transactions: Array<{
    hash: string;
    timestamp: number;
    type: "in" | "out";
    value: string;
    token?: string;
  }>;
  volume: {
    incoming: string;
    outgoing: string;
  };
  uniqueContacts: string[];
  lastActive: number;
}

export class AccountManagerTool extends Tool {
  name = "account_manager";
  description = "Manages blockchain accounts and tracks their activities";
  
  private provider: ethers.providers.JsonRpcProvider;
  private config: AccountManagerConfig;
  private cache: Map<string, {
    data: any;
    timestamp: number;
  }>;
  private wallets: Map<string, ethers.Wallet>;

  constructor(config: Partial<AccountManagerConfig> = {}) {
    super();
    this.config = {
      rpcUrl: "",
      protocol: ChainProtocol.EVM,
      maxConcurrent: 5,
      cacheEnabled: true,
      cacheTTL: 300000, // 5分钟
      defaultGasLimit: "21000",
      defaultGasPrice: "1000000000", // 1 Gwei
      ...config
    };
    this.provider = new ethers.providers.JsonRpcProvider(this.config.rpcUrl);
    this.cache = new Map();
    this.wallets = new Map();
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "get-account":
          const account = await this.getAccount(params.address);
          return JSON.stringify(account);
        
        case "get-activity":
          const activity = await this.getAccountActivity(
            params.address,
            params.startBlock,
            params.endBlock
          );
          return JSON.stringify(activity);
        
        case "create-account":
          const newAccount = await this.createAccount(params.password);
          return JSON.stringify(newAccount);
        
        case "import-account":
          const importedAccount = await this.importAccount(
            params.privateKey || params.mnemonic || params.keystore,
            params.password
          );
          return JSON.stringify(importedAccount);
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Account Manager Tool", error.message);
      }
      throw error;
    }
  }

  private async getAccount(address: string): Promise<AccountInfo> {
    const cacheKey = `account:${address}`;
    
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.data;
      }
    }

    try {
      // 获取基本信息
      const [balance, code, nonce] = await Promise.all([
        this.provider.getBalance(address),
        this.provider.getCode(address),
        this.provider.getTransactionCount(address)
      ]);

      const accountInfo: AccountInfo = {
        address,
        balance: balance.toString(),
        nonce,
        type: code === "0x" ? "eoa" : "contract",
        code: code === "0x" ? undefined : code
      };

      // 如果是合约地址,不获取代币余额
      if (accountInfo.type === "eoa") {
        accountInfo.tokens = await this.getTokenBalances(address);
      }

      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, {
          data: accountInfo,
          timestamp: Date.now()
        });
      }

      return accountInfo;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Account Manager Tool",
          `Failed to get account info for ${address}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getAccountActivity(
    address: string,
    startBlock?: number,
    endBlock?: number
  ): Promise<AccountActivity> {
    try {
      // 获取交易历史
      const filter = {
        fromBlock: startBlock || 0,
        toBlock: endBlock || "latest",
        address
      };

      const [incomingTxs, outgoingTxs] = await Promise.all([
        this.provider.getLogs({
          ...filter,
          topics: [ethers.utils.id("Transfer(address,address,uint256)")]
        }),
        this.provider.getLogs({
          ...filter,
          topics: [null, ethers.utils.id(address.toLowerCase())]
        })
      ]);

      // 处理交易数据
      const transactions: AccountActivity["transactions"] = [];
      const contacts = new Set<string>();
      let incomingVolume = BigInt(0);
      let outgoingVolume = BigInt(0);
      let lastActive = 0;

      // 处理转入交易
      for (const tx of incomingTxs) {
        const block = await this.provider.getBlock(tx.blockNumber);
        const value = ethers.BigNumber.from(tx.data).toString();
        const from = ethers.utils.getAddress("0x" + tx.topics[1].slice(26));
        
        transactions.push({
          hash: tx.transactionHash,
          timestamp: block.timestamp,
          type: "in",
          value,
          token: tx.address === ethers.constants.AddressZero ? undefined : tx.address
        });

        contacts.add(from);
        incomingVolume += BigInt(value);
        lastActive = Math.max(lastActive, block.timestamp);
      }

      // 处理转出交易
      for (const tx of outgoingTxs) {
        const block = await this.provider.getBlock(tx.blockNumber);
        const value = ethers.BigNumber.from(tx.data).toString();
        const to = ethers.utils.getAddress("0x" + tx.topics[2].slice(26));
        
        transactions.push({
          hash: tx.transactionHash,
          timestamp: block.timestamp,
          type: "out",
          value,
          token: tx.address === ethers.constants.AddressZero ? undefined : tx.address
        });

        contacts.add(to);
        outgoingVolume += BigInt(value);
        lastActive = Math.max(lastActive, block.timestamp);
      }

      return {
        transactions: transactions.sort((a, b) => b.timestamp - a.timestamp),
        volume: {
          incoming: incomingVolume.toString(),
          outgoing: outgoingVolume.toString()
        },
        uniqueContacts: Array.from(contacts),
        lastActive
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Account Manager Tool",
          `Failed to get account activity for ${address}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async createAccount(password?: string): Promise<{
    address: string;
    privateKey: string;
    mnemonic?: string;
  }> {
    try {
      // 生成新钱包
      const wallet = ethers.Wallet.createRandom();
      const address = await wallet.getAddress();

      // 如果提供了密码,加密私钥
      if (password) {
        const encrypted = await wallet.encrypt(password);
        if (this.config.keystorePath) {
          // TODO: 保存 keystore 文件
        }
      }

      // 保存钱包实例
      this.wallets.set(address, wallet.connect(this.provider));

      return {
        address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic?.phrase
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Account Manager Tool",
          `Failed to create account: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async importAccount(
    key: string,
    password?: string
  ): Promise<{ address: string }> {
    try {
      let wallet: ethers.Wallet;

      // 判断导入类型
      if (key.startsWith("0x")) {
        // 私钥导入
        wallet = new ethers.Wallet(key);
      } else if (key.split(" ").length >= 12) {
        // 助记词导入
        wallet = ethers.Wallet.fromMnemonic(key);
      } else {
        // Keystore 导入
        if (!password) {
          throw new Error("Password required for keystore import");
        }
        wallet = await ethers.Wallet.fromEncryptedJson(key, password);
      }

      const address = await wallet.getAddress();

      // 如果提供了密码,重新加密私钥
      if (password && key.startsWith("0x")) {
        const encrypted = await wallet.encrypt(password);
        if (this.config.keystorePath) {
          // TODO: 保存 keystore 文件
        }
      }

      // 保存钱包实例
      this.wallets.set(address, wallet.connect(this.provider));

      return { address };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Account Manager Tool",
          `Failed to import account: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async getTokenBalances(address: string): Promise<AccountInfo["tokens"]> {
    try {
      // TODO: 实现代币余额查询
      // 1. 从链上获取代币转账事件
      // 2. 获取代币合约信息
      // 3. 查询代币余额
      return [];
    } catch (error) {
      logger.error(
        "Account Manager Tool",
        `Failed to get token balances for ${address}: ${error.message}`
      );
      return [];
    }
  }

  public getWallet(address: string): ethers.Wallet | undefined {
    return this.wallets.get(address);
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public clearWallets(): void {
    this.wallets.clear();
  }

  public updateConfig(config: Partial<AccountManagerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };

    // 如果 RPC URL 改变,重新创建 provider
    if (config.rpcUrl) {
      this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
      
      // 重新连接所有钱包
      this.wallets.forEach((wallet, address) => {
        this.wallets.set(address, wallet.connect(this.provider));
      });
    }
  }
} 