import { VM } from '@ethereumjs/vm';
import { Common } from '@ethereumjs/common';
import { Transaction } from '@ethereumjs/tx';
import { Block } from '@ethereumjs/block';
import { Address, toBuffer } from '@ethereumjs/util';
import { DefaultStateManager } from '@ethereumjs/statemanager';
import { BaseError } from '@lumix/core';

export class EVMError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EVMError';
  }
}

export interface EVMSandboxConfig {
  chainId: number;
  hardfork?: string;
  stateRoot?: Buffer;
  debug?: boolean;
}

export interface TransactionResult {
  success: boolean;
  gasUsed: bigint;
  returnValue: Buffer;
  logs: any[];
  error?: Error;
}

export interface AccountState {
  nonce: bigint;
  balance: bigint;
  codeHash: Buffer;
  storageRoot: Buffer;
}

export class EVMSandbox {
  private vm: VM;
  private common: Common;
  private config: Required<EVMSandboxConfig>;

  constructor(config: EVMSandboxConfig) {
    this.config = {
      chainId: config.chainId,
      hardfork: config.hardfork || 'shanghai',
      stateRoot: config.stateRoot || Buffer.alloc(32),
      debug: config.debug || false
    };

    this.common = new Common({
      chain: this.config.chainId,
      hardfork: this.config.hardfork
    });

    const stateManager = new DefaultStateManager();
    
    this.vm = await VM.create({
      common: this.common,
      stateManager,
      hardfork: this.config.hardfork
    });

    if (this.config.debug) {
      this.setupDebugHooks();
    }
  }

  /**
   * 执行交易
   */
  async executeTx(
    txData: string | Buffer | Transaction
  ): Promise<TransactionResult> {
    try {
      let tx: Transaction;
      
      if (typeof txData === 'string') {
        tx = Transaction.fromSerializedTx(toBuffer(txData), { common: this.common });
      } else if (Buffer.isBuffer(txData)) {
        tx = Transaction.fromSerializedTx(txData, { common: this.common });
      } else {
        tx = txData;
      }

      const block = Block.fromBlockData({}, { common: this.common });
      const result = await this.vm.runTx({ tx, block });

      return {
        success: !result.execResult.exceptionError,
        gasUsed: result.totalGasSpent,
        returnValue: result.execResult.returnValue,
        logs: result.execResult.logs
      };
    } catch (error) {
      return {
        success: false,
        gasUsed: 0n,
        returnValue: Buffer.alloc(0),
        logs: [],
        error: error instanceof Error ? error : new EVMError('Unknown error')
      };
    }
  }

  /**
   * 获取账户状态
   */
  async getAccountState(address: string | Address): Promise<AccountState> {
    try {
      const addr = typeof address === 'string' ? Address.fromString(address) : address;
      const account = await this.vm.stateManager.getAccount(addr);

      return {
        nonce: account.nonce,
        balance: account.balance,
        codeHash: account.codeHash,
        storageRoot: account.storageRoot
      };
    } catch (error) {
      throw new EVMError(`Failed to get account state: ${error.message}`);
    }
  }

  /**
   * 设置账户状态
   */
  async setAccountState(
    address: string | Address,
    state: Partial<AccountState>
  ): Promise<void> {
    try {
      const addr = typeof address === 'string' ? Address.fromString(address) : address;
      const account = await this.vm.stateManager.getAccount(addr);

      if (state.nonce !== undefined) account.nonce = state.nonce;
      if (state.balance !== undefined) account.balance = state.balance;
      if (state.codeHash !== undefined) account.codeHash = state.codeHash;
      if (state.storageRoot !== undefined) account.storageRoot = state.storageRoot;

      await this.vm.stateManager.putAccount(addr, account);
    } catch (error) {
      throw new EVMError(`Failed to set account state: ${error.message}`);
    }
  }

  /**
   * 设置合约代码
   */
  async setCode(address: string | Address, code: Buffer): Promise<void> {
    try {
      const addr = typeof address === 'string' ? Address.fromString(address) : address;
      await this.vm.stateManager.putContractCode(addr, code);
    } catch (error) {
      throw new EVMError(`Failed to set contract code: ${error.message}`);
    }
  }

  /**
   * 获取存储值
   */
  async getStorageAt(
    address: string | Address,
    key: Buffer
  ): Promise<Buffer> {
    try {
      const addr = typeof address === 'string' ? Address.fromString(address) : address;
      return await this.vm.stateManager.getContractStorage(addr, key);
    } catch (error) {
      throw new EVMError(`Failed to get storage: ${error.message}`);
    }
  }

  /**
   * 设置存储值
   */
  async setStorageAt(
    address: string | Address,
    key: Buffer,
    value: Buffer
  ): Promise<void> {
    try {
      const addr = typeof address === 'string' ? Address.fromString(address) : address;
      await this.vm.stateManager.putContractStorage(addr, key, value);
    } catch (error) {
      throw new EVMError(`Failed to set storage: ${error.message}`);
    }
  }

  /**
   * 获取当前状态根
   */
  async getStateRoot(): Promise<Buffer> {
    try {
      return await this.vm.stateManager.getStateRoot();
    } catch (error) {
      throw new EVMError(`Failed to get state root: ${error.message}`);
    }
  }

  /**
   * 设置状态根
   */
  async setStateRoot(root: Buffer): Promise<void> {
    try {
      await this.vm.stateManager.setStateRoot(root);
    } catch (error) {
      throw new EVMError(`Failed to set state root: ${error.message}`);
    }
  }

  /**
   * 重置状态
   */
  async reset(): Promise<void> {
    try {
      await this.vm.stateManager.clearContractStorage();
      await this.setStateRoot(this.config.stateRoot);
    } catch (error) {
      throw new EVMError(`Failed to reset state: ${error.message}`);
    }
  }

  private setupDebugHooks(): void {
    this.vm.evm.events.on('step', (data: any) => {
      if (this.config.debug) {
        console.log('EVM Step:', {
          pc: data.pc,
          opcode: data.opcode.name,
          gasLeft: data.gasLeft.toString(),
          stack: data.stack.map((item: Buffer) => item.toString('hex')),
          depth: data.depth,
          address: data.address.toString()
        });
      }
    });
  }
} 